const express = require("express");
const router = express.Router();
const mongoose = require('mongoose')
const { accounts, rooms, notification } = require("../database/database");



router.post("/notifications", async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) {
      return res.status(400).json({ message: 'Username not provided' });
    }
    const user = await accounts.findOne({ username: username });
    const userNotification = await notification.findOne({ username: user._id });

    if (!userNotification) {
      return res.status(404).json({ message: 'User not found' });
    }

    const friendRequests = userNotification.friendRequests || [];

    const friendRequestsUsernames = await Promise.all(
      friendRequests.map(async (friendID) => {
        try {
          const friend = await accounts.findOne({ _id: friendID });
          return friend ? friend.username : null;
        } catch (error) {

          console.error("Error fetching friend:", error);
          return null;
        }
      })
    );

    return res.status(200).json({ status: 'success', userNotification, friendRequests: friendRequestsUsernames });
  } catch (error) {

    console.error("Unexpected error:", error);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


router.post("/:username/:repositoryName", async (req, res) => { });

router.get("/Explore/:promt", async (req, res) => {
  try {
    const promt = req.params.promt;
    res.render("explore", { promt: promt });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal server error');
  }
});


router.post("/createRoom", async (req, res) => {
  const { owner, roomName, members, description } = req.body;

  try {
    const existingRoom = await rooms.findOne({ owner: owner, name: roomName });

    if (existingRoom) {
      return res.status(400).json({
        status: "error",
        message: "A room with the same name already exists for the owner.",
      });
    }

    const ownerAccount = await accounts.findOne({ username: owner });
    const memberAccounts = await accounts.find({ username: { $in: members } });

    const newRoom = new rooms({
      name: roomName,
      owner: ownerAccount._id,
      members: memberAccounts.map(member => member._id),
      description,
      timestamp: new Date(),
    });

    await newRoom.save();

    return res.status(201).json({
      status: "success",
      message: "Room created successfully",
      room: newRoom,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

router.post("/addFriend", async (req, res) => {
  const { userId, friendId } = req.body;

  if (!userId || !friendId || userId === friendId) {
    return res.status(400).json({
      status: "error",
      message: "Invalid request. Both userId and friendId are required and must be different.",
    });
  }

  try {
    const [user, friend] = await Promise.all([
      accounts.findOne({ username: userId }),
      accounts.findOne({ username: friendId }),
    ]);

    if (!user || !friend) {
      return res.status(404).json({
        status: "error",
        message: "User or friend not found!",
      });
    }

    if (user.friends.includes(friend._id) || friend.friends.includes(user._id)) {
      return res.status(400).json({
        status: "error",
        message: "Friend already exists!",
      });
    }

    const addFriendToUser = async (user, friendId) => {
      user.friends.push(friendId);
      await user.save();
    };

    await Promise.all([
      addFriendToUser(user, friend._id),
      addFriendToUser(friend, user._id),
    ]);

    const requestingUser = await notification.findOneAndUpdate(
      { username: friend._id },
      { $pull: { friendRequests: user._id } },
      { new: true }
    );

    if (!requestingUser) {
      return res.status(404).json({ message: 'Requesting user not found' });
    }

    res.json({
      status: "success",
      message: "Friend added successfully!",
    });
  } catch (err) {
    console.error("Error adding a friend:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});

router.post("/deleteFriendRequest", async (req, res) => {
  const { userId, friendId } = req.body;

  if (!userId || !friendId || userId === friendId) {
    return res.status(400).json({
      status: "error",
      message: "Invalid request. Both userId and friendId are required and must be different.",
    });
  }

  try {
    const [user, friend] = await Promise.all([
      accounts.findOne({ username: userId }),
      accounts.findOne({ username: friendId }),
    ]);

    if (!user || !friend) {
      return res.status(404).json({
        status: "error",
        message: "User or friend not found!",
      });
    }

    const requestingUser = await notification.findOneAndUpdate(
      { username: user._id },
      { $pull: { friendRequests: friend._id } },
      { new: true }
    );

    if (!requestingUser) {
      return res.status(404).json({ message: 'Requesting user not found' });
    }

    res.json({
      status: "success",
      message: "Request removed successfully!",
    });
  } catch (err) {
    console.error("Error ", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
});


module.exports = router;