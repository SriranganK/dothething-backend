const Agenda = require('agenda');

const mongoUri = process.env.MONGO_URI;

if (!mongoUri) {
  console.error('[Agenda] Error: MONGO_URI environment variable is missing.');
}

const agenda = new Agenda({
  db: { address: mongoUri, collection: 'agendaJobs' },
  processEvery: '5 seconds'
});

// Setup event logging for monitoring
agenda.on('start', (job) => {
  console.log(`[Agenda] Job "${job.attrs.name}" [ID: ${job.attrs._id}] started`);
});

agenda.on('complete', (job) => {
  console.log(`[Agenda] Job "${job.attrs.name}" [ID: ${job.attrs._id}] completed`);
});

agenda.on('fail', (err, job) => {
  console.error(`[Agenda] Job "${job.attrs.name}" [ID: ${job.attrs._id}] failed:`, err.message);
});

module.exports = agenda;
