const express = require('express');
const router = express.Router();
const { accounts } = require('../database/database');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

router.get('/loadData', async (req, res) => {
    try {
        const { username } = req.query;
        const user = await accounts.findOne({ username });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.DOB && user.DOB instanceof Date) {
            user.DOB = user.DOB.toISOString().split('T')[0];
        } else {
            user.DOB = '';
        }

        const profilePhoto = user.profilePhoto;
        user.profilePhoto = profilePhoto ? `https://0xc7gx14-3000.inc1.devtunnels.ms/${profilePhoto}` : '';

        return res.status(200).json({ status: 'success', user: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Failed to load profile data' });
    }
});



router.get('/Edit/:username', async (req, res) => {
    const { username } = req.params;

    const sessionToken = req.cookies.sessionToken;

    try {
        const user = await accounts.findOne({ username, session: sessionToken });

        if (user) {
            res.render('profileEdit', { username: username });
        } else {
            res.redirect('/login');
        }
    } catch (error) {
        console.error(error);

        res.status(500).json({ message: 'Authentication failed' });
    }
});


const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const profileName = req.body.username;
        const uploadDir = path.join(__dirname, '../profilePhotos', profileName);

        if (req.file) {
            fs.rmSync(uploadDir, { recursive: true, force: true });
            fs.mkdir(uploadDir, { recursive: true }, (err) => {
                if (err) {
                    console.error('Error creating repository directory:', err);
                    cb(err, null);
                } else {
                    cb(null, uploadDir);
                }
            });
        } else {
            cb(null, uploadDir);
        }
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname);
    },
});

const upload = multer({ storage: storage });

// update-profile
router.post('/update-profile', upload.single('profilePhoto'), async (req, res) => {
    try {
        const {
            username,
            firstName,
            lastName,
            gender,
            DOB,
            email,
            region,
            bio,
        } = req.body;

        const user = await accounts.findOne({ username });

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const profilePhoto = req.file;

        const originalname = req.body.username;
        const photoDirectory = path.join(__dirname, '../profilePhotos', originalname);

        user.First_name = firstName;
        user.Last_name = lastName;
        user.gender = gender;
        user.DOB = DOB;
        user.email = email;
        user.region = region;
        user.bio = bio;

        if (profilePhoto) {
            const filePath = path.join(photoDirectory, profilePhoto.originalname);
            fs.renameSync(profilePhoto.path, filePath);
            user.profilePhoto = `/profilePhotos/${originalname}/${profilePhoto.originalname}`;
        }

        await fs.promises.mkdir(photoDirectory, { recursive: true });

        await user.save();

        res.json({ message: 'Profile updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Profile update failed' });
    }
});





module.exports = router;
