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

// =============================
// 1. Connexion MongoDB
// =============================
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connecté à MongoDB'))
    .catch(err => console.error('❌ Erreur MongoDB:', err));

// =============================
// 2. Modèle
// =============================
const DocumentSchema = new mongoose.Schema({
    nom: String,
    urlFichier: String,
    publicId: String,
    dateAjout: { type: Date, default: Date.now }
});
const Document = mongoose.model('Document', DocumentSchema);

// =============================
// 3. Config Cloudinary
// =============================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// =============================
// 4. STOCKAGE CLOUDINARY
// =============================
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => ({
        folder: 'meteo_documents',
        resource_type: 'auto',        // 🔹 Détection automatique pour PDF/Docs
        type: 'upload',
        access_mode: 'public',       // 🔹 essaye de rendre public
        public_id: `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`
    })
});

const upload = multer({ storage });

// =============================
// 5. Middleware sécurité
// =============================
const checkAdminPassword = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
        return res.status(403).json({ erreur: "Accès refusé" });
    }
    next();
};

// =============================
// ROUTES
// =============================

// Test API
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'API Meteo PAD en ligne ✅' });
});

// Lire documents
app.get('/api/documents', async (req, res) => {
    try {
        const documents = await Document.find().sort({ dateAjout: -1 });
        res.json(documents);
    } catch (err) {
        res.status(500).json({ erreur: "Erreur récupération documents" });
    }
});

// Upload document avec URL PDF garantie accessible
app.post('/api/upload', checkAdminPassword, upload.single('fichier'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ erreur: "Aucun fichier" });
    }

    try {
        // 🔹 1. Trouver les anciens documents
        const anciens = await Document.find({});
        
        // 🔹 2. Supprimer les anciens sur Cloudinary
        for (const doc of anciens) {
            if (doc.publicId) {
                try {
                    await cloudinary.uploader.destroy(doc.publicId, { resource_type: 'raw' });
                } catch (e) {
                    console.error("Erreur suppression Cloudinary:", e);
                }
            }
        }

        // 🔹 3. Vider la base de données
        await Document.deleteMany({});

        // 🔹 4. Récupérer l'URL réelle fournie par Cloudinary
        const fileUrl = req.file.path || req.file.secure_url;

        // 🔹 5. Sauvegarder avec publicId
        const nouveauDoc = new Document({
            nom: req.file.originalname,
            urlFichier: fileUrl,
            publicId: req.file.public_id
        });

        await nouveauDoc.save();

        res.json({
            message: "✅ Ancien bulletin remplacé par le nouveau avec succès !",
            document: nouveauDoc
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ erreur: "Erreur serveur: " + err.message });
    }
});

// =============================
// LANCEMENT
// =============================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Serveur lancé sur port ${PORT}`);
});
