const express = require("express");
const router = express.Router();
const path = require("path");
const crypto = require('crypto');
const { db, accounts, notification } = require("../database/database");
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

// Route for the sign-up page
router.get("/account", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/newaccount.html"));
});

// Route for the sign-up page
router.get("/sign-up", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/sign-up.html"));
});

// Route for the login page
router.get("/login", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/login.html"));
});

router.post("/login", async (req, res) => {
  const { login_id, password } = req.body;
  const expirationTime = 24 * 60 * 60 * 1000; // 24 hours
  const expirationDate = new Date(Date.now() + expirationTime);

  try {
    const user = await accounts.findOne({
      $or: [
        { username: login_id },
        { email: login_id },
      ],
    });

    if (user) {
      const passwordMatch = await bcrypt.compare(password, user.password);

      if (passwordMatch) {
        const sessionToken = user.session;
        res.cookie("sessionToken", sessionToken, {
          expires: expirationDate,
          httpOnly: true,
          secure: true,
        });
        res.status(200).json({
          status: "success",
          message: "Login successful!",
          user,
        });
      } else {
        res.status(401).json({
          status: "error",
          message: "Incorrect username or password.",
        });
      }
    } else {
      res.status(401).json({
        status: "error",
        message: "Incorrect username or password.",
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});




router.post("/sign-up", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const emailInUse = await accounts.findOne({ email }).lean();

    if (emailInUse) {
      return res.status(401).json({
        status: "error",
        message: "Email is already associated with another account",
      });
    }

    const existingUser = await accounts.findOne({ username }).lean();

    if (existingUser) {
      return res.status(401).json({
        status: "error",
        message: "Username is already taken",
      });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const sessionString = await generateSession();
    const sessionToken = sessionString;

    const newUser = new accounts({
      username,
      email,
      password: hashedPassword,
      session: sessionString,
    });

    await newUser.save();

    const user = await accounts.findOne({ username });

    if (!user) {
      return res.status(500).json({
        status: "error",
        message: "Failed to create user",
      });
    }

    const newUserNotification = new notification({
      username: user._id,
    });

    await newUserNotification.save();

    const expirationTime = 24 * 60 * 60 * 1000;
    const expirationDate = new Date(Date.now() + expirationTime);

    res.cookie("sessionToken", sessionToken, {
      expires: expirationDate,
      httpOnly: true,
    });

    return res.status(201).json({
      status: "success",
      message: "Sign-up successful!",
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});







router.get("/resetpassword", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/resetpassword.html"));
});

const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    // user: 'your_email@gmail.com',
    // pass: 'your_password',
  },
});


// forgot-password
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  try {
    const user = await accounts.findOne({ email }, "username _id");

    if (!user) {
      return res.status(404).json({ message: 'Email not found' });
    }

    const username = user.username;
    const resetToken = crypto.randomBytes(20).toString('hex');

    user.resetToken = resetToken;
    user.resetTokenExpiration = Date.now() + 3600000;

    await user.save();

    const mailOptions = {
      from: 'patkarmahesh387@gmail.com',
      to: email,
      subject: 'Your Password Recovery',
      text: `Dear ${username},\n\nWe received a request to reset the password for your Cosmic Arcade account. 
      If you did not initiate this request, you can ignore this email.\n\nTo reset your password, 
      please click on the link below or copy and paste it into your web browser's address bar:\n\nhttp://192.168.1.8:3000/resetpassword/${resetToken}\n\n
      This link will expire in 1 hour for security reasons. If you don't use this link within that time, you can request another password reset.
      \n\nIf you have any questions or need further assistance, please contact our support team at [Support Email].\n\nSincerely,
      \nYour Cosmic Arcade Team`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        console.log(error);
        return res.status(500).json({ message: 'Failed to send email' });
      }
      console.log('Email sent: ' + info.response);
      res.status(200).json({ message: 'Password reset email sent' });
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// resetpassword
router.get('/resetpassword/:token', async (req, res) => {
  const { token } = req.params;

  try {
    const user = await accounts.findOne({ resetToken: token, resetTokenExpiration: { $gt: Date.now() } });

    if (!user) {
      return res.send('Invalid or expired token');
    }

    res.send(`
        <form action="/reset-password/${token}" method="POST">
            <input type="password" name="newPassword" placeholder="New Password" required>
            <input type="password" name="confirmPassword" placeholder="Confirm Password" required>
            <button type="submit">Reset Password</button>
        </form>
    `);
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});


router.post('/reset-password/:token', async (req, res) => {
  const { token } = req.params;
  const { newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    return res.status(400).send('Passwords do not match');
  }

  try {
    const user = await accounts.findOne({ resetToken: token, resetTokenExpiration: { $gt: Date.now() } });

    if (!user) {
      return res.status(400).send('Invalid or expired token');
    }

    user.password = newPassword;
    user.resetToken = undefined;
    user.resetTokenExpiration = undefined;

    await user.save();

    res.status(200).send('Password reset successfully');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});

//logout
router.post("/logout", (req, res) => {
  res.clearCookie("sessionToken");
  res.sendStatus(200);
});

router.post('/deleteAccount', async (req, res) => {
  const username = req.body.username;
  console.log(username)
  try {
    const deletedAccount = await accounts.findOneAndDelete({ username: username });

    if (deletedAccount) {
      res.sendStatus(200);
    } else {
      res.status(404).json({ message: 'Account not found.' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'An error occurred while deleting the account.' });
  }
});


router.get('/favicon.ico', (req, res) => {
  res.status(204);
});

// User profile page route
router.get("/:username", async (req, res) => {
  try {
    const username = req.params.username;
    const sessionString = req.cookies.sessionToken;

    const loggedInUser = await accounts.findOne({ username: username, session: sessionString });

    if (loggedInUser) {
      res.render("loggedUserProfile", { username: loggedInUser.username });
    } else {
      const user = await accounts.findOne({ username: username });
      if (user) {
        res.render("userProfile", { username: user.username });
      } else {
        res.render("notfound");
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});


//genetare session
function generateSession() {
  return new Promise((resolve, reject) => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let sessionString = "";
    for (let i = 0; i < 20; i++) {
      const randomIndex = Math.floor(Math.random() * characters.length);
      sessionString += characters.charAt(randomIndex);
    }
    db.collection("accounts")
      .find({ session: sessionString })
      .toArray()
      .then((result) => {
        if (result.length > 0) {
          resolve(sessionString);
        } else {
          resolve(sessionString);
        }
      })
      .catch((error) => {
        console.error(error);
        reject(error);
      });
  });
}

module.exports = router;