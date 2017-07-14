const http = require('http');
const express = require('express');
const pkgcloud = require('pkgcloud');
const mongodb = require('mongodb');


const app = express();

const bodyParser = require('body-parser');

const multer = require('multer');
const upload = multer({dest: 'code/'});
const path = require('path');
const fs = require('fs');
const pify = require('pify');
const MongoClient = require('mongodb').MongoClient;
const childProcess = require('child_process');

const state = {
  nextLoadBalancerPort: 40000,
  nextDeploymentId: 0,
  deployments: new Map()
};


childProcess.spawn(`node ${path.join(__dirname, 'db_service.js')}`, [], {
  shell: true
});

MongoClient.connect('mongodb://localhost:27017/cpaas', function(err, db) {
if(err) {
  return console.log(err);
} else {

db.collection('deployments').remove();

app.use(express.static(path.join(__dirname,'..', 'web')));

app.get('/', (req, res) => {
  res.end('CPaaS Server Root\n');
});

app.post('/deploy',bodyParser.json(), (req, res) => {
  const config = req.body;
  console.log(config);
  if(state.deployments.has(config.name)) {
    res.json({error: `App ${config.name} already exists`});
  } else {
    state.deployments.set(config.name, {
      deploymentId: state.nextDeploymentId++,
      uploadedFiles: false,
      config
    });

    res.json({success: state.deployments.get(config.name)});
  }
});

app.post('/deploy/:name/:role', upload.fields([{name: 'package', maxCount: 1}, {name: 'index', maxCount: 1}]), async (req, res) => {
  console.log(`Attempt to upload rolec ${req.params.name} ${req.params.role}`);
  if(!state.deployments.has(req.params.name)) {
    console.log("Error app name");
    res.json({error: `App ${req.params.name} does not exist`});
  } else {
    const appState = state.deployments.get(req.params.name);
    const appConfig = appState.config;
    const roles = appConfig.roles.filter((role) => role.name == req.params.role);
    if(roles.length == 0) {
      console.log("Error role name");
      res.json({error: `App ${req.params.name} does not have role ${req.params.role}`});
    } else {
      console.log("No error name");
      roles[0].packageFile = path.join(process.cwd(), req.files['package'][0].destination, req.files['package'][0].filename);
      roles[0].indexFile = path.join(process.cwd(), req.files['index'][0].destination, req.files['index'][0].filename);

      console.dir(appState);

      res.json({success: `Uploaded ${req.params.name} ${req.params.role}`});
    }
  }
});

app.get('/deploy/:name', async (req, res) => {
 if(!state.deployments.has(req.params.name)) {
    console.log("Error app name");
    res.json({error: `App ${req.params.name} does not exist`});
  } else {
    console.log('Got deploy');
    const appState = state.deployments.get(req.params.name);
    const appConfig = appState.config;

    const client = pkgcloud.compute.createClient({
        provider: 'openstack',
        authUrl: 'http://controller:5000',

        region: 'RegionOne',
        tenantName: 'demo',

        username: 'demo',
        password: 'password',

        domainName: 'Default',

        projectDomainName: 'Default',
        keystoneAuthVersion: 'v3'
    });
    const rolesIps = await Promise.all(appConfig.roles.map(role => deployRoleInstances(role, client, appConfig.name)));
    //console.log(rolesIps);
    appConfig.roles.forEach((role, index) => {
      role.ips = rolesIps[index];
    });
    console.dir(appConfig.roles)
    childProcess.spawn(`node ${path.join(__dirname, 'load_balancer.js')}`, [], {
      env: {
        IPS: rolesIps[0].join(','),
        PORT: state.nextLoadBalancerPort
      },
      shell: true

    });
    db.collection('deployments').insert({
      _id: state.deployments.get(req.params.name).deploymentId,
      name: req.params.name,
      ips: rolesIps[0]
    });
    console.log("Started load balancer on port " + state.nextLoadBalancerPort);
    state.nextLoadBalancerPort = state.nextLoadBalancerPort + 1;
    res.json({"success": state.nextLoadBalancerPort - 1});
  }
});

function range(n) {
  const res = [];
  for(let i = 0; i < n; i++) res.push(i);
  return res;
}

async function deployRoleInstances(role, client, baseName) {
   const flavor_id = '75a62fda-53db-4439-97d8-6c80c6eb8627';
   const image_id = '2ea2a983-8662-4cb8-8481-a01d23097583';
   const keypair_name = 'mykey';
   const security_group_id = 'default';

   const packageContent = await pify(fs.readFile)(role.packageFile);
   const indexContent = await pify(fs.readFile)(role.indexFile);

   //const instance_name = `${baseName}_${role.name}_0`;

  const ips = await Promise.all(range(role.count).map(i => {
   let instance_name = `${baseName}_${role.name}_${i}`;
   const userdata = new Buffer(`#!/usr/bin/env bash
cat > package.json << 'endmsg'
${packageContent.toString()}
endmsg

cat > index.js << 'endmsg'
${indexContent.toString()}
endmsg

export NAME=${instance_name}
export DB_SERVICE_HOST=10.0.2.2
export DB_SERVICE_PORT=8081
export CPAAS__PORT=8080


npm start
`).toString('base64');
    return deployInstance(client, {
      name: instance_name,
      image: image_id,
      flavor: flavor_id,
      keyname: keypair_name,
      cloudConfig: userdata,
      securityGroups: false
    });
  }));
  console.log(ips);
  return ips;

}

// Depoy an instance and resolve with the ip
async function deployInstance(client, config) {
  return new Promise((res, rej) => {
    client.createServer(config, (err, server) => {
      if(err) {
        return console.log(err);
      }

      server.setWait({status: server.STATUS.running}, 5000, (err) => {
        if(err) {
          return console.dir(err);
        }
        console.log(server.addresses.private[0]);
        res(server.addresses.private[0]);
      });
    });
  });
}

app.get('/src/:name', (req, res) => {
  if(!state.deployments.has(req.params.name)) {
    res.json({error: `App ${req.params.name} does not exist`});
  } else {
    res.sendFile(state.deployments.get(req.params.name).file);
  }
});



app.listen(8080, ()=> {
  console.log('Listening on port 8080');
});
}
});
