const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json());

// 1. Connexion à MongoDB
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connecté à MongoDB'))
    .catch(err => console.error('❌ Erreur MongoDB:', err));

// 2. Modèle de Données (Ce qu'on sauvegarde)
const DocumentSchema = new mongoose.Schema({
    nom: String,
    urlFichier: String,
    dateAjout: { type: Date, default: Date.now }
});
const Document = mongoose.model('Document', DocumentSchema);

// 3. Configuration Cloudinary (Pour stocker le PDF) 
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// IMPORTANT: params must be a function for multer-storage-cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        return {
            folder: 'meteo_documents',
            resource_type: 'auto',  // auto-detect: PDFs get proper Content-Type header
            public_id: `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`
        };
    }
});

// Middleware to check admin password BEFORE multer processes the file
const checkAdminPassword = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
        return res.status(403).json({ erreur: "Accès refusé. Mot de passe incorrect." });
    }
    next();
};

const upload = multer({ storage: storage });

// ==========================================
// ROUTES DE L'API
// ==========================================

// Route racine — pour que Render ne renvoie pas "Cannot GET /"  
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'API Documents Meteo PAD en ligne ✅' });
});

// A. Route pour LIRE les documents (Public)
app.get('/api/documents', async (req, res) => {
    try {
        const documents = await Document.find().sort({ dateAjout: -1 }).limit(10);
        res.json(documents);
    } catch (err) {
        res.status(500).json({ erreur: "Impossible de récupérer les documents" });
    }
});

// B. Route pour UPLOADER un document (Protégé par Mot de passe)
// checkAdminPassword runs FIRST, then multer upload
app.post('/api/upload', checkAdminPassword, upload.single('fichier'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ erreur: "Aucun fichier fourni." });
    }

    try {
        const nouveauDoc = new Document({
            nom: req.file.originalname,
            urlFichier: req.file.path
        });
        await nouveauDoc.save();

        res.json({ message: "Fichier uploadé avec succès !", document: nouveauDoc });
    } catch (err) {
        console.error('Erreur sauvegarde:', err);
        res.status(500).json({ erreur: "Erreur lors de la sauvegarde dans la base de données." });
    }
});

// Lancer le serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 API Document démarrée sur http://localhost:${PORT}`);
});
