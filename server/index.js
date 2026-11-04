const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configuração de CORS e suporte a payload Base64 até 50MB
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Importar rotas
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const gachaRoutes = require('./routes/gachaRoutes');
const adminRoutes = require('./routes/adminRoutes');
const cardRoutes = require('./routes/cardRoutes');
const pvpRoutes = require('./routes/pvpRoutes');
app.use(express.json());
// Registar rotas (gachaRoutes fica livre do middleware restrito de admin)
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', gachaRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api', pvpRoutes);
app.use('/api', adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Servidor Ninja Legends ativo na porta ${PORT}`));