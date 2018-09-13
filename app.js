var tmi = require("tmi.js");
var fs = require('fs');
var constants = require('./constants.js');
var requests = require("./requests.js");
var plotly = require("plotly")(constants.plotlyUser, constants.plotlyKey);
var emotes = JSON.parse(fs.readFileSync('global.json','utf8'));
var bttvEmotes = JSON.parse(fs.readFileSync('bttvemotes.json', 'utf8'));

const express = require('express');
const app = express();
const port = process.env.PORT || 5000;
app.listen(port, () => console.log(`Listening on port ${port}`));

app.get('/', (req, res) => {
    res.send('Hello World!');
    res.render('../views/App');
});
app.get('/api/hello', (req, res) => {
    res.send({ express: 'Hello From Express' });
});

app.post('/api/graph', (req, res) => {
    
});

let fileName = 'temp';
let fileNameConst = 1;

var options = {
    options: {
        debug: true
    },
    connection: {
        reconnect: true
    },
    identity: {
        username: constants.username,
        password: constants.password
    },
    channels: constants.channels
};

var client = new tmi.client(options);

var avgViewerTime = 0;
var channelViewers = {};
var totalTime = 0;
var intervals = 0;

var intervalMessages = 0;
let spikeConstant = 2.5;
const viewerInterval = 10000;
const debugInterval = 10000;

//can do chat uniqueness -> percent of unique msgs compared total mgss
var uniqueChatMessages = 0;
var totalChatMessages = 0;


var newUsers = [];


var chatMsgs = [];
var chatMsgsPerInterval = [];
//return top 10 emotes in chat
var emoteMsgs = {};
//for copypastas want to do some detection, maybe characters in message has to be at least 12 characters to filter out emotes and low quality spam
var copypastas = {};


setInterval(getAverage, 8000);
setInterval(debugLog, debugInterval);
setInterval(averageViewerTime, viewerInterval);
setInterval(() => {
    chatMsgsPerInterval = [];
}, 9000);

var prevAvg = 0;
var currAvg = 0;
var maxAvg = 0;


function getAverage() {
    prevAvg = currAvg;
    currAvg = intervalMessages/5;
    if(currAvg > maxAvg) {
        maxAvg = currAvg;
    }
    if((currAvg/spikeConstant) > prevAvg) {
        handleHotspot();
    }
    intervalMessages = 0;
}


function debugLog() {
    console.log("prevAvg: " + prevAvg + " currAvg: " + currAvg + " maxAvg: " + maxAvg);
    console.log("totalMsgs: " + totalChatMessages + " uniqueMsgs: " + uniqueChatMessages);
    console.log(`chatMsgsPerInterval: ${chatMsgsPerInterval}`);
    console.log(`emoteMsgs: ${JSON.stringify(emoteMsgs)}`);
    console.log(`copypastas: ${copypastas}`);

    //writeToFile(fileName + fileNameConst + ".txt", chatMessagesRaw)
    // fileNameConst++;
}


/* 
    question of what we want to plot
        - uniqueness of chat over time -> uniqueMsgs/totalMsgs * 100
        - average chat msgs over time -> totalMsgs / 100
        - average viewer time over time 
        - average emote usage over time 
        - total chat msgs over time 

    other non plotable things that should be included on dashboard
        - top copypastas (maybe top 5) + number of times spammed
        - top emotes + number of times used
        - twitch chat embedded on the side


*/


// Connect the client to the server..
client.connect().then(function(data) {
    console.log(`CONNECTED: ${data}`);
}).catch(function(err) {
    console.log(err);
});

client.on("chat", onChatHandler);
client.on("join", onJoinHandler);



function onChatHandler(channel, userstate, message,self) {
    if (self) return;
    //storage of chat msgs for chat analysis
    chatMsgsPerInterval.push(message);
    chatMsgs.forEach((element) => {
        if (element.message == message) {
            element.count++;
        }
    });
    if(chatMsgs.includes(message)) {
        chatMsgs[message] += 1;
    }
    else {
       chatMsgs[message] = 1;
       uniqueChatMessages++;
    }
    intervalMessages++;

    //copypasta checker and data entry
    if(isCopypasta(message)) {
        if(copypastas.hasOwnProperty(message)){
            copypastas[message] += 1;
        }
        else {
            copypastas[message] = 1;
        }
    }
    //emote checker and data entry
    Object.keys(emotes).forEach((key) => {
        if(message.includes(key)) {
            if(emoteMsgs.hasOwnProperty(key)) {
                emoteMsgs[key] += 1;
            }
            else {
                emoteMsgs[key] = 1;
            }
        }
    });
    Object.keys(bttvEmotes).forEach((key) => {
        if(message.includes(key)) {
            if(emoteMsgs.hasOwnProperty(key)) {
                emoteMsgs[key] += 1;
            }
            else {
                emoteMsgs[key] = 1;
            }
        }
    })

    //commands
    if(message === "#followage") {
        followageDateHandler(channel, userstate);
    }
    if(message === "#uptime") {
        uptimeHandler(channel, userstate);
    }
    if(message === "#title") {
        streamTitleHandler(channel, userstate);
    }
    if(message === "#blackfr0st") {
        client.say(channel, "https://imgur.com/0I3W6fQ");
    }
    if(message === "#copypasta") {
        //copypastasHandler()
    }
    if(message === "#emotes") {
        //topEmotesHandler()
    }
    if(message === "#opgg") {
        //opggHander()
    }
    if(message === "#viewer") {
        averageViewerTime(channel, userstate);
    }
    
} 

function followageDateHandler(channel, userstate) {
    var prefix = "@" + userstate.username + ", ";
    requests.followage(channel, userstate, (res) => {
        if(res.total < 1) {
            client.say(channel, prefix + userstate.username + " is not following " + channel.substring(1) + "!");
        }
        else if (res.total == 1) {
            var followDate = new Date(res.data[0].followed_at);
            var currentDate = new Date();
            var difference = (currentDate.getTime() - followDate.getTime()) / 1000; //difference in date in seconds
            var days = difference/60/60/24;
            var daysFloored = Math.floor(days);
            var hours = Math.round((days - daysFloored) * 24);
            client.say(channel, prefix + userstate.username + " has been following " + channel.substring(1) + " for " + daysFloored + " days and " + hours + " hours!");
        }
    });
}

function uptimeHandler(channel, userstate) {
    var prefix = "@" + userstate.username + ", ";
    requests.uptime(channel, (res) => {
        if(res.data === undefined || res.data.length == 0) {
            client.say(channel, prefix + channel.substring(1) + " is not live!");
        }
        else if(res.data[0].type === "live") {
            var startTime = new Date(res.data[0].started_at);
            var currentDate = new Date();
            var difference = (currentDate.getTime() - startTime.getTime()) / 1000;
            var hours = difference /60/60;
            var hoursFloored = Math.floor(hours);
            var minutes = Math.round((hours - hoursFloored) * 60);
            client.say(channel, prefix + channel.substring(1) + " has been streaming for " + hoursFloored + " hours and " + minutes + " minutes!");
        }
    });
}

function streamTitleHandler(channel, userstate) {
    var prefix = "@" + userstate.username + ", ";
    requests.streamTitle(channel, (res) => {
        if(res.data === undefined || res.data.length == 0) {
            client.say(channel, prefix + channel.substring(1) + " is not live!");
        }
        else if(res.data[0].type === "live") {
            var title = res.data[0].title;
            client.say(channel, prefix + "Current Stream Title: " + title);
        }
    });
}


function copypastasHandler(channel, message) {
    
}

client.on("disconnected", (reason) => {
    console.log(`Disconnected: ${reason}`);
});
client.on("connected", function (address, port) {
    console.log("connected");
});


function onJoinHandler(channel, username, self) {
    console.log(`${username} has joined the channel`);
    newUsers.push(username)
}


function emoteGraph() {
    
}

function handleHotspot() {
    //plot to graph
    console.log("chat spike detected");
}


/*https://tmi.twitch.tv/group/user/USERNAME/chatters
    For getting average viewer looktime 
    if user is in object, add minute to their time every minute 
    if user is not in object, then add them to object with initial value of 0 
    only looks at viewers and not moderators, bots, twitch admin, etc
    if object,hasOwnProperty(username)
        object.username += 0.1
        total viewer watch time / viewers
        plot graph over time 
*/

function averageViewerTime() {
    var channel  = "#imaqtpie";
        requests.getViewerList(channel, (res) => {
            var viewerList = res.chatters.viewers; //get viewerlist
            viewerList.forEach((viewer) => {
                if(channelViewers.hasOwnProperty(viewer)) {
                    channelViewers[viewer] += (viewerInterval/1000); //add seconds 
                }
                else {
                    channelViewers[viewer] = 0; 
                }
            });
            let totalViewers = Object.keys(channelViewers).length;
            Object.keys(channelViewers).forEach((key) => {
                totalTime += Number(channelViewers[key]);
            });
            if(totalTime !== 0) {
                avgViewerTime = Number(totalTime/totalViewers);
            }
            totalTime = 0;
            intervals++;
            console.log(`Average Viewer Time (s) : ${avgViewerTime}`);
            console.log(`Max Viewer Time (s) ${intervals * viewerInterval/1000}`);
        });
    // });
}


function isCopypasta(message) {
    if(message.length >= 12) {
        if(chatMsgsPerInterval.includes(message)){
            return true;
        }
    }
    else {
        return false;
    }
}
function writeToFile(fileName, data) {
    fs.writeFile(fileName, data, function(err){
        if (err) console.log(err);
        console.log("Successfully Written to File.");
    });
}
