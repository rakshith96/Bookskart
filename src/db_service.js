const express = require('express');
const MongoClient = require('mongodb').MongoClient;
const bodyParser = require('body-parser');
const app = express();
// Connect to the db
MongoClient.connect("mongodb://localhost:27017/cpaas", function(err, db) {
  if(err) { return console.dir(err); }

  const deployments = db.collection('deployments');
  const books = db.collection('books');
  app.get('/', function(req, res) {
    
    console.log('/');
    res.end('DB Service');
  });  
  app.post('/find',bodyParser.json(), function(req, res) {
    const query = req.body;
    const ip = req.ip.split('::ffff:')[1];
    
    console.log('/find');
    console.dir(query);
    console.log(ip);

    deployments.findOne({"ips": ip}, function(err, deployment) {
      if(err) { return console.log(err); }
      query.tenantId = deployment._id;
      console.log('Tenant id ' + deployment._id);
      console.log(query);
      books.find(query).toArray(function(err, items) {
        if(err) { return console.log(err); }
        console.log(items);
        res.json(items.map((item) => {return item;}));
      });
    });

  });

  app.post('/insert',bodyParser.json(), function(req, res) {
    const doc = req.body;
    const ip = req.ip.split('::ffff:')[1];
    console.log('/insert');
    deployments.findOne({"ips": ip}, function(err, deployment) {
      if(err) { return console.log(err); }
      doc.tenantId = deployment._id;
      console.log(doc);
      books.insert(doc, function(err) {
        if(err) { return console.log(err); }
        res.json(JSON.stringify({success: "Inserted Successfully"}));
      });
    });
  });

  app.listen(8081, () => console.log('DB Service listening on port 8081'));
  
});
