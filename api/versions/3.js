const express = require("express");
var app = express.Router();
const mappings = require("../../src/mappings.js");
delete require.cache[require.resolve(mappings.config)];
var config = require(mappings.config);
const flake = require('simpleflake');
const crypto = require('crypto');
let client = { db: global.db };
const fetch = require("node-fetch");

const baseURL = "https://censorbot.jt3ch.net";
const redirectURL = "https://api.jt3ch.net/censorbot/v3/auth/callback";

/*
    global RR
    global manager
    global BigInt
*/

function checkShard(guildID, shardamount) {
    guildID = String(guildID);
    var shard;
    for (var i = 0; i < shardamount; i++) {
        if ((BigInt(guildID) >> BigInt(22)) % BigInt(shardamount) == i) { shard = i; break; }
    }
    return shard;
}
let getuser = async(tok) => {
    let e = await fetch("https://discordapp.com/api/users/@me", {
        method: "GET",
        headers: {
            Authorization: `Bearer ${tok}`,
        }
    })
    return await e.json();
}

function encodeJSON(element, key, list) {
    var list = list || [];
    if (typeof(element) == 'object') {
        for (var idx in element)
            encodeJSON(element[idx], key ? key + '[' + idx + ']' : idx, list);
    }
    else {
        list.push(key + '=' + encodeURIComponent(element));
    }
    return list.join('&');
}

async function getToken(code) {
    var f = await fetch("https://discordapp.com/api/v6/oauth2/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        body:
            encodeJSON(
                {
                    client_id: config.oauth.id,
                    client_secret: config.oauth.secret,
                    code: code,
                    grant_type: "authorization_code",
                    redirect_uri: redirectURL,
                    scope: "identify guilds"
                }    
            )
    })
    return await f.json();
}


app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "*");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    console.log(req.method + " " + req.url);
    next();
});

app.get("/", (req, res) => { res.json({hello: "world"}) })

app.get("/auth", (req, res) => {
    res.redirect(
        "https://discordapp.com/api/oauth2/authorize?"
            + encodeJSON(
                {
                    client_id: config.oauth.id,
                    redirect_uri: redirectURL,
                    response_type: "code",
                    scope: "identify guilds"
                }    
            )
    )
})

app.get("/test", (req, res) => {
    res.redirect("https://google.com/?c=123");
})

app.get("/auth/callback", async (req, res) => {
    if(!req.query.code) return res.send("Error, no code provided");
    var resp = await getToken(req.query.code);
    if(resp.error) return res.send("An error occured while authenticating you!");
    
    const send = (token) => { res.redirect(baseURL + "/dash/v3/login?token=" + token) };
    
    var user = await getuser(resp.access_token);
    if(!user || user.error) return res.send("Error occured while finding your account");
    
    var dashUser = await client.db.dashdb.getAll(user.id);
    if(dashUser) {
        if(dashUser.bearer !== resp.access_token) await client.db.dashdb.set(user.id, "bearer", resp.access_token);
        return send(dashUser.token);
    }
    
    let newToken = crypto.createHash('sha256').update(flake(new Date())).update(config.oauth.mysecret).digest('hex');
    
    await client.db.dashdb.create(user.id, {
        token: newToken,
        bearer: resp.access_token
    });
    
    send(newToken);
})

delete require.cache[require.resolve("../website/router.js")];
var website = require("../website/router.js");
app.use("/website", website);

// app.get("*", (req,res) => {
//     res.status(403);
//     res.json({
//         error: "WIP"
//     })
// })

module.exports = app;