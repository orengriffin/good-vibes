const serverless = require('serverless-http');
const QuickChart = require('quickchart-js');
const bodyParser = require('body-parser');
const { MongoClient } = require('mongodb');
const _ = require('lodash');
const express = require('express');
const TeleBot = require('slimbot');
const moment = require('moment');
const axios = require('axios');

const plotly = require('plotly')(process.env.PLOTLY_USER, process.env.PLOTLY_TOKEN);

const addLabelUrl = process.env.POST_ADD_LABEL_URL;
const bot = new TeleBot(process.env.TELEGRAM_TOKEN);

const app = express();

const atlasUser = process.env.ATLAS_USER;
const atlasPass = process.env.ATLAS_PASS;
const atlasDb = process.env.ATLAS_DB;

function connect() {
  return new Promise((resolve, reject) => {
    const atlasUrl = `mongodb+srv://${atlasUser}:${atlasPass}@cluster0.ftmm9.mongodb.net/${atlasDb}?retryWrites=true&w=majority`;
    //const mlabUrl = `mongodb://${mlabUser}:${mlabPass}@ds131743.mlab.com:31743/${mlabDb}`;
    MongoClient.connect(atlasUrl)
      .then((client) => {
        const db = client.db(atlasDb);
        return resolve(db);
      })
      .catch((err) => {
        reject(err);
      });
  });
}

function isNumber(param) {
  return !Number.isNaN(+param);
}

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

async function feelGoodMessage(chatId) {
  const keyboard = {
    parse_mode: 'Markdown',
    reply_markup: JSON.stringify({
      inline_keyboard: [[
      ], [
        { text: '-3', callback_data: '/-3' },
        { text: '-2', callback_data: '/-2' },
        { text: '-1', callback_data: '/-1' },
        { text: '0', callback_data: '/0' },
        { text: '1', callback_data: '/1' },
        { text: '2', callback_data: '/2' },
        { text: '3', callback_data: '/3' },
      ], [
        { text: 'notifications on', callback_data: '/start' },
        { text: 'notifications off', callback_data: '/stop' },
      ], [
        { text: 'create report', callback_data: '/report' },
      ]
      ],
    }),
  };
  await bot.sendMessage(chatId, 'How are you feeling? (0 ok, 1 good, 2 very good, 3 amazing!, -1 not so well, -2 bad, -3 very bad)', keyboard);
}

const createGraphData = data => ({
    datasets: [{
      data,
      fill: false,
      borderColor: 'blue',
      backgroundColor: 'blue' 
    }]
})

async function createReport1(chatId) {
  const db = await connect();
  const reports = await db.collection('report').find({ chatId }).sort({ date: 1 }).toArray();
  console.log('');
  const type = 'line';
  const options = {
    scales: {
      xAxes:[ { 
          type: 'time',
          time: {
              unit: 'day',
              displayFormats: { quarter: 'YYYY-MM-DD H:mm:ss'}
          },
      } ],
    }
  }
  const now = new Date();
  const nintyDaysAgo = now.getTime() - (90 * 86400000);
   const data = reports.map((report) => ({
      x: new Date(report.date),
      y: report.report
   })).filter(d => d.x.getTime() > nintyDaysAgo);
  //console.log(data);
  const qc = new QuickChart();
  qc.setConfig({ type, data: createGraphData(data), options });
  return qc.getShortUrl();
  //return qc.getUrl();

}


async function createReport(chatId) {
  const db = await connect();
  const reports = await db.collection('report').find({ chatId }).sort({ date: 1 }).toArray();
  const x = [];
  const y = [];
  const type = 'scatter';
  reports.forEach((report) => {
    x.push(moment(report.date).format('YYYY-MM-DD H:mm:ss'));
    y.push(report.report);
  });
  const data = [{ x, y, type }];
  const graphOptions = {
    filename: `date-axes-test-${chatId}`,
    fileopt: 'overwrite',
  };
  return new Promise((resolve, reject) => {
    plotly.plot(data, graphOptions, (err, msg) => {
      if (err) {
        reject(err);
      } else {
        resolve(msg);
      }
    });
  });
}

app.get('/get-message', async (req, res) => {
  const db = await connect();
  const cursor = db.collection('users').find({ status: 'on' });
  for (let user = await cursor.next(); user != null; user = await cursor.next()) {
    console.log(`Sending message to ${user.firstName}`);
    //if (user._id == 184823763) { // avicii id
    await feelGoodMessage(user._id);
    //}
  }
  res.send('get Hello World!');
});

app.post('/post-message', async (req, res) => {
  console.log(JSON.stringify(req.body, 2, 2));
  try {
    let messageBody = null;
    if (req.body.message != null) {
      messageBody = req.body.message;
    } else if (req.body.callback_query != null) {
      messageBody = req.body.callback_query.message;
    } else {
      return res.status('500').send('unknown');
    }

    let text = _.get(req.body, 'callback_query.data');
    if (!text) {
      ({ text } = messageBody);
    }
    if (text.charAt(0) === '/') {
      text = text.slice(1);
    }

    const date = new Date();
    const chatId = _.get(messageBody, 'chat.id');

    console.log({ text });
    console.log({ chatId });
    console.log({ date });

    const db = await connect();

    if (text === 'start') {
      // first message "/start"
      // will record the user in db
      const firstName = _.get(messageBody, 'chat.first_name');
      const lastName = _.get(messageBody, 'chat.last_name');
      const status = 'on';

      await db.collection('users').save({
        _id: chatId, firstName, lastName, date, status,
      });
      await bot.sendMessage(chatId, 'notifications on');
      await feelGoodMessage(chatId);
      return res.send('notification on');
    }

    if (text === 'stop') {
      await db.collection('users').update({ _id: chatId }, { $set: { status: 'off' } });
      const replyMessage = 'notifications off';
      console.log({ replyMessage });
      await bot.sendMessage(chatId, replyMessage);
      return res.send(replyMessage.url);
    }

    if (text === 'report') {
      const replyMessage = await createReport1(chatId);
      console.log({ replyMessage });
      await bot.sendMessage(chatId, replyMessage);
      return res.send(replyMessage.url);
    }

    if (isNumber(text)) {
      const report = Number(text);
      console.log({ report });
      let replyMessage = 'shut off';
      if (report > 5 || report < -5) {
        replyMessage = 'report should be between -5 and 5';
      } else {
        await db.collection('report').insert({ chatId, report, date });
        if (report > 0) {
          replyMessage = 'doing good!';
        } else if (report <= -3) {
          replyMessage = 'call for help!';
        } else {
          replyMessage = 'good vibes are coming';
        }
      }

      console.log({ replyMessage });
      await bot.sendMessage(chatId, replyMessage);
      return res.send(replyMessage);
    }
    const teams = [
      'data',
      'algo',
      'euclid',
      'planning',
      'front-s',
      'infra'
    ];
    if (teams.includes(text)) {
      const messageText = messageBody.text;
      if (messageText) {
        const user = messageText.split("'")[1];
        console.log(`user: ${user}`);
        const issueNumber = messageText.split('(')[1].split(')')[0];
        console.log(`issueNumber: ${issueNumber}`);
        await db.collection('optibus-users').insertOne({ user, team: text });
        const result = await axios.post(addLabelUrl, { team: text, issueNumber });
        console.log(result);
      }
      await bot.sendMessage(chatId, 'doing shit');
      return res.send('bad text');
    }
    await bot.sendMessage(chatId, 'bad text');
    return res.send('bad text');


    //
  } catch (err) {
    console.error(err);
    return res.status(500).send(err);
  }
});

module.exports.handler = serverless(app);
