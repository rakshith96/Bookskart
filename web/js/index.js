const stage = 1;
let stage1Div, stage2Div, stage3Div;

function init() {
  stage1Div = document.querySelector('#stage1');
  stage2Div = document.querySelector('#stage2');
  stage3Div = document.querySelector('#stage3');
  const stage1Form = stage1Div.querySelector('form');
  stage1Form.addEventListener('submit', stage1submit);
}

function stage1submit(evt) {
  event.preventDefault();
  const stage1Form = evt.target;
  const configFileInput = stage1Form.querySelector('#configFile');
  const configFile = configFileInput.files[0];
  const configFileReader = new FileReader();
  configFileReader.readAsText(configFile);
  const stage1Xhr = new XMLHttpRequest();
  stage1Xhr.open('post', '/deploy');

  stage1Xhr.addEventListener('readystatechange', function() {
    if(stage1Xhr.readyState === 4 && stage1Xhr.status === 200) {
       const stage1Response = JSON.parse(stage1Xhr.responseText);
       if(stage1Response.success) {
         buildStage2(stage1Response.success.config);
         stage1Div.classList.add('hidden');
       } else {
         alert('Error');
       }
    }
  });

  configFileReader.addEventListener('load', function(evt) {
    //console.log(evt.target.result);
    stage1Xhr.setRequestHeader('Content-Type', 'application/json');
    stage1Xhr.send(evt.target.result);
  });
}

function buildStage2(appConfig) {
  const appNameEl = stage2Div.querySelector('.appName');
  const stage2Form = stage2Div.querySelector('form');
  appNameEl.innerText = appConfig.name;
  appConfig.roles.forEach(role => {
    appendRoleInputs(stage2Form, role);
  });

  stage2Form.innerHTML += `<input type="submit" value="Upload">`;
  stage2Form.addEventListener('submit', function(evt) {
    evt.preventDefault();
    appConfig.roles.forEach(role => {
      const rolePackageFileInput = stage2Form.querySelector(`input[name='${role.name}-package']`);
      const roleIndexFileInput = stage2Form.querySelector(`input[name='${role.name}-index']`);
      uploadRoleFiles(appConfig.name, role.name, rolePackageFileInput.files[0], roleIndexFileInput.files[0]);
    });
    buildStage3(appConfig.name);
    stage2Div.classList.toggle('hidden');
  });

  stage2Div.classList.toggle('hidden');
}

function appendRoleInputs(formEl, roleConfig) {
  formEl.innerHTML +=
`${roleConfig.name} package.json <input type="file" name="${roleConfig.name}-package"><br/>
 ${roleConfig.name} index.js <input type="file" name="${roleConfig.name}-index"><br/>`;
}

function uploadRoleFiles(appName, roleName, packageFile, indexFile) {
  const formData = new FormData();
  formData.append('package', packageFile);
  formData.append('index', indexFile);
  const roleXhr = new XMLHttpRequest();
  roleXhr.open('post', `/deploy/${appName}/${roleName}`);
  roleXhr.send(formData);
}

function buildStage3(appName) {
  const appNameEl =  stage3Div.querySelector('.appName');
  appNameEl.innerText = appName;

  const deployButton = stage3Div.querySelector('#deploy');

  deployButton.addEventListener('click', function() {
    console.log('clicked ' + appName);
    const stage3Xhr = new XMLHttpRequest();
    stage3Xhr.open('get', `/deploy/${appName}`);
    stage3Xhr.addEventListener('readystatechange', function() {
      if(stage3Xhr.readyState === 4 && stage3Xhr.status === 200) {
        const urlDiv = stage3Div.querySelector('#appUrl');
        console.log(stage3Xhr.responseText);
        const res = JSON.parse(stage3Xhr.responseText);
        urlDiv.innerText = `App running at 192.168.133.2:${res.success}`;
      }

    });

    stage3Xhr.send();
  });

  stage3Div.classList.toggle('hidden');
}

window.addEventListener('DOMContentLoaded', init);







