const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

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

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'meteo_documents', // Dossier sur Cloudinary
        resource_type: 'raw', // "raw" est obligatoire pour les PDF, Word, PPT
        allowed_formats: ['pdf', 'doc', 'docx', 'ppt', 'pptx']
    }
});
const upload = multer({ storage: storage });

// ==========================================
// 🚀 LES ROUTES DE L'API
// ==========================================

// A. Route pour LIRE les documents (Public)
app.get('/api/documents', async (req, res) => {
    try {
        const documents = await Document.find().sort({ dateAjout: -1 }).limit(10); // Les 10 derniers
        res.json(documents);
    } catch (err) {
        res.status(500).json({ erreur: "Impossible de récupérer les documents" });
    }
});

// B. Route pour UPLOADER un document (Protégé par Mot de passe)
app.post('/api/upload', upload.single('fichier'), async (req, res) => {
    // 1. Vérifier le mot de passe
    if (req.headers.authorization !== `Bearer ${process.env.ADMIN_PASSWORD}`) {
        return res.status(403).json({ erreur: "Accès refusé. Mot de passe incorrect." });
    }

    // 2. Vérifier si un fichier a bien été envoyé
    if (!req.file) {
        return res.status(400).json({ erreur: "Aucun fichier fourni." });
    }

    try {
        // 3. Sauvegarder l'URL du fichier (renvoyée par Cloudinary) dans MongoDB
        const nouveauDoc = new Document({
            nom: req.file.originalname,
            urlFichier: req.file.path // C'est le lien URL sécurisé !
        });
        await nouveauDoc.save();

        res.json({ message: "Fichier uploadé avec succès !", document: nouveauDoc });
    } catch (err) {
        res.status(500).json({ erreur: "Erreur lors de la sauvegarde." });
    }
});

// Lancer le serveur
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 API Document démarrée sur http://localhost:${PORT}`);
});
