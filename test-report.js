const { MongoClient } = require('mongodb');
const plotly = require('plotly')('orengriffin', 'gpf1kkWnDYH3bAFWnhMZ');
const moment = require('moment');
const QuickChart = require('quickchart-js');

const atlasUser = process.env.ATLAS_USER || 'oren';
const atlasPass = process.env.ATLAS_PASS || 'oren';
const atlasDb = process.env.ATLAS_DB || 'feel-good';

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
  };
  const now = new Date();
  const nintyDaysAgo = now.getTime() - (90 * 86400000);
   const data = reports.map((report) => ({
      x: new Date(report.date),
      y: report.report
   })).filter(d => d.x.getTime() > nintyDaysAgo);
  //console.log(data);
  const qc = new QuickChart();
  qc.setConfig({ type, data: createGraphData(data), options });
  //return qc.getShortUrl();
  return qc.getUrl();

}



async function start() {
  try {
    const url =  await createReport1(184823763);
    console.log(url);
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}

console.log('');

start();
