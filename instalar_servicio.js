const Service = require('node-windows').Service;
const path = require('path');

const svc = new Service({
    name: 'GuardaEquipajesAPI',
    description: 'API para Guarda Equipajes - Sistema de Gestión de Lockers',
    script: path.join(__dirname, 'server.js'),
    nodeOptions: ['--harmony'],
    env: {
        name: 'NODE_ENV',
        value: 'production'
    }
});

svc.on('install', function() {
    console.log('✅ Servicio GuardaEquipajesAPI instalado correctamente');
    svc.start();
});

svc.on('alreadyinstalled', function() {
    console.log('⚠️ El servicio GuardaEquipajesAPI ya está instalado');
});

svc.on('start', function() {
    console.log('✅ Servicio GuardaEquipajesAPI iniciado');
});

svc.on('stop', function() {
    console.log('⏹️ Servicio GuardaEquipajesAPI detenido');
});

svc.on('error', function(err) {
    console.error('❌ Error:', err);
});

svc.install();
