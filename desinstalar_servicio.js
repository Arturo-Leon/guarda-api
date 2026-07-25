const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
    name: 'GuardaEquipajesAPI',
    script: path.join(__dirname, 'server.js')
});

svc.on('uninstall', function() {
    console.log('✅ Servicio GuardaEquipajesAPI desinstalado');
});

svc.on('alreadyuninstalled', function() {
    console.log('⚠️ El servicio no estaba instalado');
});

svc.uninstall();
