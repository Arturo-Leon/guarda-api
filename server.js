const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const dbPath = path.join(__dirname, 'guarda_equipajes.db');
console.log('📁 Base de datos:', dbPath);

const db = new sqlite3.Database(dbPath);

// Crear tablas
db.serialize(() => {
    // Usuarios
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE,
        password TEXT,
        rol TEXT
    )`);
    db.run(`INSERT OR IGNORE INTO usuarios (username, password, rol) 
            VALUES ('Administrador', 'admin123', 'admin')`);
    
    // Lockers
    db.run(`CREATE TABLE IF NOT EXISTS lockers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE,
        tamanio TEXT,
        estado TEXT DEFAULT 'disponible'
    )`);
    
    // NO crear lockers automáticamente
console.log('📦 Sistema listo. Los lockers se crearán manualmente');
    
    // Clientes
    db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT,
        identificacion TEXT UNIQUE,
        telefono TEXT,
        email TEXT,
        direccion TEXT
    )`);

    // Tabla de configuración (UN SOLO CREATE)
    db.run(`CREATE TABLE IF NOT EXISTS configuracion (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        clave TEXT UNIQUE,
        valor TEXT
    )`);
    
    // Registros
    db.run(`CREATE TABLE IF NOT EXISTS registros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        numero_registro TEXT,
        codigo_equipaje TEXT,
        locker_codigo TEXT,
        cliente_nombre TEXT,
        cliente_identificacion TEXT,
        fecha TEXT,
        monto REAL,
        estado TEXT DEFAULT 'activo',
        metodo_pago TEXT,
        fecha_retiro TEXT,
        hora_retiro TEXT
    )`);
    
    // Movimientos de caja
    db.run(`CREATE TABLE IF NOT EXISTS movimientos_caja (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tipo TEXT,
        concepto TEXT,
        monto REAL,
        metodo TEXT,
        fecha TEXT,
        hora TEXT,
        registro TEXT
    )`);
    
    // Historial de cierres
    db.run(`CREATE TABLE IF NOT EXISTS historial_cierres (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno INTEGER,
        fechaApertura TEXT,
        horaApertura TEXT,
        fechaCierre TEXT,
        horaCierre TEXT,
        montoInicial REAL,
        ingresos REAL,
        egresos REAL,
        pendientes REAL,
        totalEsperado REAL,
        arqueoEfectivo REAL,
        diferencia REAL,
        estado TEXT,
        observaciones TEXT
    )`);
    
    console.log('✅ Tablas listas');
});

db.run(`CREATE TABLE IF NOT EXISTS sucursales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    activo INTEGER DEFAULT 1,
    fecha_creacion TEXT
)`);

db.run(`CREATE TABLE IF NOT EXISTS sucursales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT,
    direccion TEXT,
    telefono TEXT,
    email TEXT,
    activo INTEGER DEFAULT 1,
    fecha_creacion TEXT
)`);

// ============ VERIFICAR TOKEN ============
function verifyToken(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'No token' });
    const token = auth.split(' ')[1];
    try {
        const decoded = jwt.verify(token, 'secreto');
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid token' });
    }
}

// ============ LOGIN ============
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    console.log('Login:', username);
    db.get('SELECT * FROM usuarios WHERE username = ?', [username], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Usuario no existe' });
        if (password === user.password) {
            const token = jwt.sign({ id: user.id, username: user.username }, 'secreto');
            res.json({ success: true, token, usuario: { id: user.id, username: user.username, rol: user.rol } });
        } else {
            res.status(401).json({ error: 'Contraseña incorrecta' });
        }
    });
});

// ============ LOCKERS ============
app.get('/api/lockers', verifyToken, (req, res) => {
    db.all('SELECT * FROM lockers ORDER BY codigo', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, lockers: rows });
    });
});

app.post('/api/lockers', verifyToken, (req, res) => {
    const { codigo, tamanio, estado } = req.body;
    console.log('POST /api/lockers:', codigo, tamanio, estado);
    db.run(`INSERT INTO lockers (codigo, tamanio, estado) VALUES (?, ?, ?)`,
        [codigo, tamanio || 'mediano', estado || 'disponible'], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/lockers/:id', verifyToken, (req, res) => {
    const { codigo, tamanio, estado } = req.body;
    const id = req.params.id;
    console.log('PUT /api/lockers/', id, codigo, tamanio, estado);
    db.run(`UPDATE lockers SET codigo = ?, tamanio = ?, estado = ? WHERE id = ?`,
        [codigo, tamanio, estado, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/lockers/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    console.log('DELETE /api/lockers/', id);
    db.run(`DELETE FROM lockers WHERE id = ?`, [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ SUCURSALES ============
app.get('/api/sucursales', verifyToken, (req, res) => {
    db.all('SELECT * FROM sucursales ORDER BY id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, sucursales: rows || [] });
    });
});

app.post('/api/sucursales', verifyToken, (req, res) => {
    const { id, nombre, direccion, telefono, email, activo } = req.body;
    if (id) {
        db.run(`UPDATE sucursales SET nombre=?, direccion=?, telefono=?, email=?, activo=? WHERE id=?`,
            [nombre, direccion, telefono, email, activo, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    } else {
        db.run(`INSERT INTO sucursales (nombre, direccion, telefono, email, activo) VALUES (?,?,?,?,?)`,
            [nombre, direccion, telefono, email, activo || 1], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
    }
});

app.delete('/api/sucursales/:id', verifyToken, (req, res) => {
    db.run('DELETE FROM sucursales WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ CLIENTES ============
app.get('/api/clientes', verifyToken, (req, res) => {
    db.all('SELECT * FROM clientes ORDER BY id', [], (err, rows) => {
        if (err) {
            console.error('❌ Error obteniendo clientes:', err.message);
            return res.status(500).json({ success: false, error: err.message });
        }
        console.log('📤 Clientes encontrados:', rows ? rows.length : 0);
        res.json({ success: true, clientes: rows || [] });
    });
});

app.post('/api/clientes', verifyToken, (req, res) => {
    const { id, nombre, identificacion, telefono, email, direccion, registros, total_gastado } = req.body;
    console.log('📥 POST /api/clientes - Body:', { id, nombre, identificacion, registros, total_gastado });
    
    if (id) {
        db.get('SELECT id FROM clientes WHERE id = ?', [id], (err, row) => {
            if (err) return res.status(500).json({ error: err.message });
            
            if (row) {
                db.run(`UPDATE clientes SET nombre=?, identificacion=?, telefono=?, email=?, direccion=?, registros=?, total_gastado=? WHERE id=?`,
                    [nombre, identificacion, telefono || null, email || null, direccion || null, registros || 0, total_gastado || 0, id], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, id: parseInt(id) });
                });
            } else {
                db.run(`INSERT INTO clientes (id, nombre, identificacion, telefono, email, direccion, registros, total_gastado) VALUES (?,?,?,?,?,?,?,?)`,
                    [id, nombre, identificacion, telefono || null, email || null, direccion || null, registros || 0, total_gastado || 0], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, id: parseInt(id) });
                });
            }
        });
    } else {
                db.run(`INSERT INTO clientes (nombre, identificacion, telefono, email, direccion, registros, total_gastado) VALUES (?,?,?,?,?,?,?)`,
                    [nombre, identificacion, telefono || null, email || null, direccion || null, registros || 0, total_gastado || 0], function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    res.json({ success: true, id: this.lastID });
                });
            }
        });
    
 

app.delete('/api/clientes/:id', verifyToken, (req, res) => {
    db.run(`DELETE FROM clientes WHERE id = ?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ REGISTROS ============
app.get('/api/registros', verifyToken, (req, res) => {
    db.all('SELECT * FROM registros ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, registros: rows || [] });
    });
});
app.post('/api/registros', verifyToken, (req, res) => {
    const { numero_registro, codigo_equipaje, locker_id, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, fecha, hora, monto, estado, metodo_pago, descripcion_equipaje, cliente_telefono } = req.body;
    db.run(`INSERT INTO registros (numero_registro, codigo_equipaje, locker_id, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, cliente_telefono, descripcion_equipaje, fecha, hora, monto, estado, metodo_pago) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [numero_registro, codigo_equipaje, locker_id || null, locker_codigo, tamanio_locker, cliente_nombre, cliente_identificacion, cliente_telefono || null, descripcion_equipaje || null, fecha, hora, monto, estado || 'activo', metodo_pago], function(err) {
        if (err) {
            console.error('❌ Error insertando registro:', err.message);
            return res.status(500).json({ error: err.message });
        }
        if (locker_codigo) {
            db.run(`UPDATE lockers SET estado = 'ocupado' WHERE codigo = ?`, [locker_codigo]);
        }
        res.json({ success: true, id: this.lastID });
    });
});

app.post('/api/registros/:id/retirar', verifyToken, (req, res) => {
    const id = req.params.id;
    const { fecha_retiro, hora_retiro, metodo_pago, monto } = req.body;
    db.get('SELECT locker_codigo FROM registros WHERE id = ?', [id], (err, row) => {
        if (row && row.locker_codigo) {
            db.run(`UPDATE lockers SET estado = 'disponible' WHERE codigo = ?`, [row.locker_codigo]);
        }
        const montoFinal = monto || 0;
        db.run(`UPDATE registros SET estado = 'finalizado', fecha_retiro = ?, hora_retiro = ?, metodo_pago = ?, monto = ? WHERE id = ?`, 
            [fecha_retiro, hora_retiro, metodo_pago, montoFinal, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});


app.delete('/api/registros/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    db.run('DELETE FROM registros WHERE id = ?', [id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Actualizar registro (para corregir tamanio_locker)
app.put('/api/registros/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    const { tamanio_locker, metodo_pago, monto } = req.body;
    
    let query = 'UPDATE registros SET ';
    const params = [];
    
    if (tamanio_locker) {
        query += 'tamanio_locker = ?';
        params.push(tamanio_locker);
    }
    if (metodo_pago) {
        if (params.length > 0) query += ', ';
        query += 'metodo_pago = ?';
        params.push(metodo_pago);
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ CONFIGURACIÓN DE PRECIOS ============
app.post('/api/configuracion/precios', verifyToken, (req, res) => {
    const { configPrecios, tarifasHoras, configPreciosExtra } = req.body;
    console.log('💾 Guardando precios:', { configPrecios, configPreciosExtra });
    
    db.run(`INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)`, 
        ['configPrecios', JSON.stringify(configPrecios)], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        
        db.run(`INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)`, 
            ['tarifasHoras', JSON.stringify(tarifasHoras)], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            
            db.run(`INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)`, 
                ['configPreciosExtra', JSON.stringify(configPreciosExtra || {})], (err3) => {
                if (err3) return res.status(500).json({ error: err3.message });
                res.json({ success: true });
            });
        });
    });
});

app.get('/api/configuracion/precios', verifyToken, (req, res) => {
    console.log('📥 Obteniendo configuración de precios');
    
    db.all('SELECT clave, valor FROM configuracion WHERE clave IN ("configPrecios", "tarifasHoras", "configPreciosExtra")', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const result = {};
        rows.forEach(row => {
            try {
                result[row.clave] = JSON.parse(row.valor);
            } catch(e) {
                console.error('Error parseando:', e);
            }
        });
        
        res.json({ success: true, configuracion: result });
    });
});

// ============ CONFIGURACIÓN DEL SISTEMA ============
app.post('/api/configuracion/sistema', verifyToken, (req, res) => {
    const { configSistema } = req.body;
    console.log('💾 Guardando configuración del sistema en SQLite');
    
    db.run(`INSERT OR REPLACE INTO configuracion (clave, valor) VALUES (?, ?)`, 
        ['configSistema', JSON.stringify(configSistema)], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Configuración guardada en SQLite' });
    });
});

app.get('/api/configuracion/sistema', verifyToken, (req, res) => {
    console.log('📥 Obteniendo configuración del sistema');
    
    db.get('SELECT valor FROM configuracion WHERE clave = "configSistema"', [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        
        let configSistema = null;
        if (row) {
            try {
                configSistema = JSON.parse(row.valor);
            } catch(e) {
                console.error('Error parseando:', e);
            }
        }
        
        res.json({ success: true, configSistema: configSistema });
    });
});

// ============ MOVIMIENTOS DE CAJA ============
app.get('/api/movimientos', verifyToken, (req, res) => {
    db.all('SELECT * FROM movimientos_caja ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, movimientos: rows || [] });
    });
});

app.post('/api/movimientos', verifyToken, (req, res) => {
    const { tipo, concepto, monto, metodo, fecha, hora, registro } = req.body;
    db.run(`INSERT INTO movimientos_caja (tipo, concepto, monto, metodo, fecha, hora, registro) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tipo, concepto, monto, metodo, fecha, hora, registro], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

app.put('/api/movimientos/:id', verifyToken, (req, res) => {
    const { tipo, concepto, monto, metodo, fecha, hora, registro } = req.body;
    const id = req.params.id;
    db.run(`UPDATE movimientos_caja SET tipo = ?, concepto = ?, monto = ?, metodo = ?, fecha = ?, hora = ?, registro = ? WHERE id = ?`,
        [tipo, concepto, monto, metodo, fecha, hora, registro, id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ HISTORIAL DE CIERRES ============
app.get('/api/historial/cierres', verifyToken, (req, res) => {
    db.all('SELECT * FROM historial_cierres ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, historial: rows || [] });
    });
});

app.post('/api/cierre', verifyToken, (req, res) => {
    const { turno, fechaApertura, horaApertura, fechaCierre, horaCierre, 
            montoInicial, ingresos, egresos, pendientes, totalEsperado, 
            arqueoEfectivo, diferencia, estado, observaciones } = req.body;
    
    db.run(`INSERT INTO historial_cierres (
        turno, fechaApertura, horaApertura, fechaCierre, horaCierre,
        montoInicial, ingresos, egresos, pendientes, totalEsperado,
        arqueoEfectivo, diferencia, estado, observaciones
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [turno, fechaApertura, horaApertura, fechaCierre, horaCierre,
         montoInicial, ingresos, egresos, pendientes, totalEsperado,
         arqueoEfectivo, diferencia, estado, observaciones], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, id: this.lastID });
    });
});

// ============ RESPALDO DE DATOS ============

// Configuración de respaldo automático
const BACKUP_CONFIG = {
    intervaloHoras: 24,        // Cada 24 horas
    maxBackups: 7,             // Mantener últimos 7 respaldos
    carpeta: path.join(__dirname, 'backups')
};

// Crear carpeta de respaldos si no existe
const fs = require('fs');
if (!fs.existsSync(BACKUP_CONFIG.carpeta)) {
    fs.mkdirSync(BACKUP_CONFIG.carpeta, { recursive: true });
    console.log('📁 Carpeta de respaldos creada:', BACKUP_CONFIG.carpeta);
}

// Función para limpiar respaldos antiguos (mantener solo los últimos N)
function limpiarRespaldosAntiguos() {
    try {
        const archivos = fs.readdirSync(BACKUP_CONFIG.carpeta)
            .filter(f => f.startsWith('backup_auto_') && f.endsWith('.json'))
            .map(f => ({
                nombre: f,
                path: path.join(BACKUP_CONFIG.carpeta, f),
                stats: fs.statSync(path.join(BACKUP_CONFIG.carpeta, f))
            }))
            .sort((a, b) => b.stats.mtime - a.stats.mtime);
        
        if (archivos.length > BACKUP_CONFIG.maxBackups) {
            const eliminar = archivos.slice(BACKUP_CONFIG.maxBackups);
            eliminar.forEach(archivo => {
                fs.unlinkSync(archivo.path);
                console.log(`🗑️ Respaldo antiguo eliminado: ${archivo.nombre}`);
            });
        }
        
        console.log(`📊 Respaldos actuales: ${Math.min(archivos.length, BACKUP_CONFIG.maxBackups)}/${BACKUP_CONFIG.maxBackups}`);
    } catch (error) {
        console.error('Error limpiando respaldos:', error);
    }
}

// Función para crear respaldo automático
function crearRespaldoAutomatico(tipo = 'auto') {
    console.log(`🔄 Ejecutando respaldo ${tipo}...`);
    
    const backup = {
        fecha: new Date().toLocaleString(),
        tipo: tipo,
        version: '1.0',
        timestamp: Date.now(),
        datos: {}
    };
    
    const tablas = ['usuarios', 'lockers', 'clientes', 'registros', 'movimientos_caja', 'historial_cierres', 'configuracion'];
    let pendientes = tablas.length;
    let error = false;
    
    tablas.forEach(tabla => {
        db.all(`SELECT * FROM ${tabla}`, [], (err, rows) => {
            if (err) {
                console.error(`❌ Error exportando ${tabla}:`, err.message);
                error = true;
            } else {
                backup.datos[tabla] = rows;
                console.log(`   ✅ ${tabla}: ${rows.length} registros`);
            }
            pendientes--;
            
            if (pendientes === 0 && !error) {
                const fechaStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                const filename = `backup_${tipo}_${fechaStr}.json`;
                const filepath = path.join(BACKUP_CONFIG.carpeta, filename);
                
                fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
                console.log(`💾 Respaldo ${tipo} guardado: ${filename}`);
                
                if (tipo === 'auto') {
                    limpiarRespaldosAntiguos();
                }
            } else if (pendientes === 0 && error) {
                console.error(`❌ Error al crear respaldo ${tipo}`);
            }
        });
    });
}

// Endpoint: Exportar todos los datos a JSON
app.get('/api/backup/exportar', verifyToken, (req, res) => {
    console.log('📤 Exportando respaldo completo...');
    
    const backup = {
        fecha: new Date().toLocaleString(),
        usuario: req.user.username,
        version: '1.0',
        datos: {}
    };
    
    const tablas = ['usuarios', 'lockers', 'clientes', 'registros', 'movimientos_caja', 'historial_cierres', 'configuracion'];
    let pendientes = tablas.length;
    let error = null;
    
    tablas.forEach(tabla => {
        db.all(`SELECT * FROM ${tabla}`, [], (err, rows) => {
            if (err) {
                console.error(`Error exportando ${tabla}:`, err);
                error = err;
            } else {
                backup.datos[tabla] = rows;
                console.log(`✅ ${tabla}: ${rows?.length || 0} registros`);
            }
            pendientes--;
            
            if (pendientes === 0) {
                if (error) {
                    res.status(500).json({ error: 'Error al exportar datos' });
                } else {
                    const filename = `backup_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
                    const filepath = path.join(BACKUP_CONFIG.carpeta, filename);
                    
                    fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
                    console.log(`💾 Respaldo guardado: ${filename}`);
                    
                    res.json({ 
                        success: true, 
                        archivo: filename,
                        mensaje: `Respaldo creado: ${filename}`
                    });
                }
            }
        });
    });
});

// Endpoint: Listar respaldos disponibles
app.get('/api/backup/listar', verifyToken, (req, res) => {
    if (!fs.existsSync(BACKUP_CONFIG.carpeta)) {
        return res.json({ success: true, respaldos: [] });
    }
    
    const archivos = fs.readdirSync(BACKUP_CONFIG.carpeta).filter(f => f.endsWith('.json'));
    const respaldos = archivos.map(f => {
        const stats = fs.statSync(path.join(BACKUP_CONFIG.carpeta, f));
        return {
            nombre: f,
            fecha: stats.mtime,
            tamaño: stats.size
        };
    }).sort((a, b) => b.fecha - a.fecha);
    
    res.json({ success: true, respaldos });
});

// Endpoint: Restaurar desde un archivo de respaldo
app.post('/api/backup/restaurar', verifyToken, (req, res) => {
    const { archivo } = req.body;
    const filepath = path.join(BACKUP_CONFIG.carpeta, archivo);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    try {
        const backup = JSON.parse(fs.readFileSync(filepath, 'utf8'));
        const tablas = ['usuarios', 'lockers', 'clientes', 'registros', 'movimientos_caja', 'historial_cierres', 'configuracion'];
        let completadas = 0;
        let huboError = false;
        
        db.serialize(() => {
            db.run('BEGIN TRANSACTION');
            
            tablas.forEach(tabla => {
                db.run(`DELETE FROM ${tabla}`, (err) => {
                    if (err) {
                        console.error(`Error limpiando ${tabla}:`, err);
                        huboError = true;
                    }
                    
                    if (backup.datos[tabla] && Array.isArray(backup.datos[tabla]) && backup.datos[tabla].length > 0) {
                        const datos = backup.datos[tabla];
                        const columnas = Object.keys(datos[0]);
                        const placeholders = columnas.map(() => '?').join(',');
                        const insertStmt = db.prepare(`INSERT INTO ${tabla} (${columnas.join(',')}) VALUES (${placeholders})`);
                        
                        datos.forEach(row => {
                            const valores = columnas.map(col => row[col]);
                            insertStmt.run(valores);
                        });
                        insertStmt.finalize();
                    }
                    
                    completadas++;
                    if (completadas === tablas.length) {
                        if (huboError) {
                            db.run('ROLLBACK', () => {
                                res.status(500).json({ error: 'Error durante la restauración' });
                            });
                        } else {
                            db.run('COMMIT', () => {
                                console.log('✅ Restauración completada');
                                res.json({ success: true, mensaje: 'Datos restaurados correctamente' });
                            });
                        }
                    }
                });
            });
        });
    } catch (error) {
        console.error('Error restaurando:', error);
        res.status(500).json({ error: 'Error al leer el archivo de respaldo' });
    }
});

// Endpoint: Descargar respaldo
app.get('/api/backup/download/:archivo', verifyToken, (req, res) => {
    const filepath = path.join(BACKUP_CONFIG.carpeta, req.params.archivo);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    res.download(filepath, req.params.archivo);
});

// Endpoint: Eliminar respaldo
app.delete('/api/backup/eliminar/:archivo', verifyToken, (req, res) => {
    const filepath = path.join(BACKUP_CONFIG.carpeta, req.params.archivo);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    
    fs.unlinkSync(filepath);
    console.log(`🗑️ Respaldo eliminado: ${req.params.archivo}`);
    res.json({ success: true });
});

// Endpoint: Crear respaldo manual
app.post('/api/backup/manual', verifyToken, (req, res) => {
    console.log('📤 Creando respaldo manual...');
    
    const backup = {
        fecha: new Date().toLocaleString(),
        tipo: 'manual',
        usuario: req.user.username,
        version: '1.0',
        timestamp: Date.now(),
        datos: {}
    };
    
    const tablas = ['usuarios', 'lockers', 'clientes', 'registros', 'movimientos_caja', 'historial_cierres', 'configuracion'];
    let pendientes = tablas.length;
    let error = false;
    
    tablas.forEach(tabla => {
        db.all(`SELECT * FROM ${tabla}`, [], (err, rows) => {
            if (err) {
                console.error(`Error exportando ${tabla}:`, err);
                error = true;
            } else {
                backup.datos[tabla] = rows;
            }
            pendientes--;
            
            if (pendientes === 0) {
                if (error) {
                    return res.status(500).json({ error: 'Error al crear respaldo' });
                }
                
                const fechaStr = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
                const filename = `backup_manual_${fechaStr}.json`;
                const filepath = path.join(BACKUP_CONFIG.carpeta, filename);
                
                fs.writeFileSync(filepath, JSON.stringify(backup, null, 2));
                console.log(`💾 Respaldo manual guardado: ${filename}`);
                
                res.json({ 
                    success: true, 
                    archivo: filename,
                    mensaje: 'Respaldo manual creado exitosamente'
                });
            }
        });
    });
});

// Endpoint: Obtener configuración del respaldo automático
app.get('/api/backup/config', verifyToken, (req, res) => {
    res.json({ 
        success: true, 
        config: {
            intervaloHoras: BACKUP_CONFIG.intervaloHoras,
            maxBackups: BACKUP_CONFIG.maxBackups,
            proximoRespaldo: new Date(Date.now() + BACKUP_CONFIG.intervaloHoras * 60 * 60 * 1000).toLocaleString()
        }
    });
});

// Programar respaldo automático cada X horas
function iniciarRespaldoAutomatico() {
    setTimeout(() => {
        crearRespaldoAutomatico('auto');
    }, 5000);
    
    setInterval(() => {
        crearRespaldoAutomatico('auto');
        console.log(`⏰ Respaldo automático ejecutado a las ${new Date().toLocaleString()}`);
    }, BACKUP_CONFIG.intervaloHoras * 60 * 60 * 1000);
    
    console.log(`⏰ Respaldo automático programado cada ${BACKUP_CONFIG.intervaloHoras} horas`);
}

// Activar respaldo automático
iniciarRespaldoAutomatico();

// ============ DASHBOARD Y HEALTH ============
app.get('/api/dashboard', verifyToken, (req, res) => {
    db.get(`SELECT 
        (SELECT COUNT(*) FROM registros) as total_registros,
        (SELECT COUNT(*) FROM lockers WHERE estado = 'disponible') as disponibles,
        (SELECT COUNT(*) FROM lockers WHERE estado = 'ocupado') as ocupados,
        (SELECT COUNT(*) FROM lockers) as total_lockers,
        (SELECT COALESCE(SUM(monto), 0) FROM registros) as total_ingresos
    `, [], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, stats: row || {} });
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================
// ENDPOINTS DE MANTENIMIENTO (ADMIN)
// ============================================

// Limpiar clientes
app.delete('/api/admin/clear/clientes', verifyToken, (req, res) => {
    db.run('DELETE FROM clientes', function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Clientes eliminados' });
    });
});

// Limpiar lockers
app.delete('/api/admin/clear/lockers', verifyToken, (req, res) => {
    db.run('DELETE FROM lockers', function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Lockers eliminados' });
    });
});

// Limpiar registros
app.delete('/api/admin/clear/registros', verifyToken, (req, res) => {
    db.run('DELETE FROM registros', function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Registros eliminados' });
    });
});

// Limpiar movimientos de caja
app.delete('/api/admin/clear/movimientos', verifyToken, (req, res) => {
    db.run('DELETE FROM movimientos_caja', function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Movimientos eliminados' });
    });
});

// Limpiar historial de cierres
app.delete('/api/admin/clear/historial', verifyToken, (req, res) => {
    db.run('DELETE FROM historial_cierres', function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: 'Historial eliminado' });
    });
});

// Resetear lockers personalizados
app.post('/api/admin/reset/lockers/custom', verifyToken, (req, res) => {
    const { pequenos = 0, medianos = 0, grandes = 0 } = req.body;
    
    db.run(`DELETE FROM lockers`, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        let total = 0;
        let insertados = 0;
        
        for (let i = 1; i <= pequenos; i++) {
            const codigo = `P-${i.toString().padStart(2, '0')}`;
            db.run(`INSERT INTO lockers (codigo, tamanio, estado) VALUES (?, 'pequeño', 'disponible')`, [codigo], () => insertados++);
            total++;
        }
        
        for (let i = 1; i <= medianos; i++) {
            const codigo = `M-${i.toString().padStart(2, '0')}`;
            db.run(`INSERT INTO lockers (codigo, tamanio, estado) VALUES (?, 'mediano', 'disponible')`, [codigo], () => insertados++);
            total++;
        }
        
        for (let i = 1; i <= grandes; i++) {
            const codigo = `G-${i.toString().padStart(2, '0')}`;
            db.run(`INSERT INTO lockers (codigo, tamanio, estado) VALUES (?, 'grande', 'disponible')`, [codigo], () => insertados++);
            total++;
        }
        
        const checkInterval = setInterval(() => {
            if (insertados === total) {
                clearInterval(checkInterval);
                res.json({ success: true, total });
            }
        }, 100);
    });
});

// ============ USUARIOS ============

// Obtener todos los usuarios
app.get('/api/usuarios', verifyToken, (req, res) => {
    db.all('SELECT id, nombre, username, rol, activo, fecha_creacion FROM usuarios ORDER BY id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, usuarios: rows || [] });
    });
});

// Crear o actualizar usuario
app.post('/api/usuarios', verifyToken, (req, res) => {
    const { id, nombre, username, password, rol, activo } = req.body;
    
    if (!nombre || !username) {
        return res.status(400).json({ error: 'Nombre y usuario son requeridos' });
    }
    
    if (id) {
        // Actualizar usuario existente
        let query = 'UPDATE usuarios SET nombre = ?, username = ?, rol = ?, activo = ?';
        let params = [nombre, username, rol, activo];
        
        if (password) {
            query += ', password = ?';
            params.push(password);
        }
        
        query += ' WHERE id = ?';
        params.push(id);
        
        db.run(query, params, function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint')) {
                    return res.status(400).json({ error: 'El nombre de usuario ya existe' });
                }
                return res.status(500).json({ error: err.message });
            }
            res.json({ success: true, message: 'Usuario actualizado' });
        });
    } else {
        // Crear nuevo usuario
        const passwordHash = password || 'admin123';
        db.run(`INSERT INTO usuarios (nombre, username, password, rol, activo, fecha_creacion) 
                VALUES (?, ?, ?, ?, ?, datetime('now'))`,
            [nombre, username, passwordHash, rol || 'operador', activo !== undefined ? activo : 1],
            function(err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint')) {
                        return res.status(400).json({ error: 'El nombre de usuario ya existe' });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ success: true, id: this.lastID });
            }
        );
    }
});

// Eliminar usuario
app.delete('/api/usuarios/:id', verifyToken, (req, res) => {
    const id = req.params.id;
    
    // No permitir eliminar al administrador
    db.get('SELECT username FROM usuarios WHERE id = ?', [id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Usuario no encontrado' });
        if (row.username === 'Administrador') {
            return res.status(400).json({ error: 'No se puede eliminar al Administrador' });
        }
        
        db.run('DELETE FROM usuarios WHERE id = ?', [id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// ============ SUCURSALES ============
app.get('/api/sucursales', verifyToken, (req, res) => {
    db.all('SELECT * FROM sucursales ORDER BY id', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, sucursales: rows || [] });
    });
});

app.post('/api/sucursales', verifyToken, (req, res) => {
    const { id, nombre, direccion, telefono, email, activo } = req.body;
    if (id) {
        db.run(`UPDATE sucursales SET nombre=?, direccion=?, telefono=?, email=?, activo=? WHERE id=?`,
            [nombre, direccion, telefono, email, activo ? 1 : 0, id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    } else {
        db.run(`INSERT INTO sucursales (nombre, direccion, telefono, email, activo) VALUES (?,?,?,?,?)`,
            [nombre, direccion, telefono, email, activo ? 1 : 0], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true, id: this.lastID });
        });
    }
});

app.delete('/api/sucursales/:id', verifyToken, (req, res) => {
    db.run('DELETE FROM sucursales WHERE id = ?', [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ============ INICIAR SERVIDOR ============
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🚀 API corriendo en puerto ' + PORT);
    console.log('🚀 API SQLITE corriendo en http://localhost:3000');
    console.log('🔐 POST /api/login');
    console.log('📦 GET /api/lockers');
    console.log('📦 POST /api/lockers');
    console.log('📦 PUT /api/lockers/:id');
    console.log('📦 DELETE /api/lockers/:id');
    console.log('👥 GET /api/clientes');
    console.log('👥 POST /api/clientes');
    console.log('👥 DELETE /api/clientes/:id');
    console.log('📋 GET /api/registros');
    console.log('📋 POST /api/registros');
    console.log('📋 POST /api/registros/:id/retirar');
    console.log('⚙️ GET /api/configuracion/precios/configPreciosExtra');
    console.log('⚙️ POST /api/configuracion/precios');
    console.log('⚙️ GET /api/configuracion/sistema');
    console.log('⚙️ POST /api/configuracion/sistema');
    console.log('📊 GET /api/dashboard');
    console.log('💰 GET /api/movimientos');
    console.log('💰 POST /api/movimientos');
    console.log('📜 GET /api/historial/cierres');
    console.log('📜 POST /api/cierre');
});
