require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { v4: uuidv4 } = require('uuid');

const app = express();

// Enhanced Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*'
}));
app.use(express.json({ limit: '10kb' }));

// Rate Limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/auth', limiter);

// Database Connection with Improved Config
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/socialquest', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  
})
.then(() => console.log('✅ MongoDB Connected!'))
.catch(err => console.error('❌ Connection Failed:', err.message));

// Enhanced Schemas with Validation
const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    minlength: 3,
    maxlength: 20,
    match: /^[a-zA-Z0-9_]+$/ // Alphanumeric + underscore
  },
  password: { 
    type: String, 
    required: true,
    select: false // Never return password in queries
  },
  level: { type: Number, default: 1, min: 1 },
  xp: { type: Number, default: 0, min: 0 },
  coins: { type: Number, default: 100, min: 0 },
  streak: { type: Number, default: 0, min: 0 },
  lastActive: { type: Date, default: Date.now },
  inventory: { type: [String], default: [] },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  challengesCompleted: { type: Number, default: 0, min: 0 },
  title: { 
    type: String, 
    default: 'Newbie',
    enum: ['Newbie', 'Rookie', 'Pro', 'Legend', 'Master'] // Predefined titles
  },
  refreshToken: { type: String, select: false }
}, { timestamps: true });

const postSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  content: { 
    type: String, 
    required: true,
    minlength: 1,
    maxlength: 500 
  },
  likes: [{ 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User' 
  }],
  comments: [{
    userId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: 'User' 
    },
    content: {
      type: String,
      required: true,
      minlength: 1,
      maxlength: 200
    },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

const challengeSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: { 
    type: String, 
    enum: ['daily', 'weekly', 'special'], 
    required: true 
  },
  description: { 
    type: String, 
    required: true,
    minlength: 5,
    maxlength: 100
  },
  target: { 
    type: Number, 
    required: true,
    min: 1
  },
  progress: { 
    type: Number, 
    default: 0,
    min: 0
  },
  reward: { 
    type: Number, 
    required: true,
    min: 1
  },
  completed: { 
    type: Boolean, 
    default: false 
  },
  expiresAt: { 
    type: Date, 
    required: true,
    validate: {
      validator: function(v) {
        return v > new Date();
      },
      message: 'Expiration date must be in the future'
    }
  }
}, { timestamps: true });

// Models
const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Challenge = mongoose.model('Challenge', challengeSchema);

// Improved Authentication Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader?.split(' ')[1];
    
    if (!token) return res.status(401).json({ error: "Access token required" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');
    
    if (!user) return res.status(403).json({ error: "Invalid token - user not found" });
    
    req.user = user; // Attach full user object
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: "Token expired" });
    }
    return res.status(403).json({ error: "Invalid token" });
  }
};

// Helper Functions
const createDefaultChallenges = async (userId) => {
  const now = new Date();
  const challenges = [
    {
      userId,
      type: 'daily',
      description: 'Post 3 times today',
      target: 3,
      reward: 50,
      expiresAt: new Date(now.setHours(23, 59, 59, 999))
    },
    {
      userId,
      type: 'weekly',
      description: 'Get 50 likes this week',
      target: 50,
      reward: 200,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    }
  ];
  
  return Challenge.insertMany(challenges);
};

const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { id: userId }, 
    process.env.JWT_SECRET, 
    { expiresIn: '15m' }
  );
  
  const refreshToken = jwt.sign(
    { id: userId }, 
    process.env.JWT_REFRESH_SECRET, 
    { expiresIn: '7d' }
  );
  
  return { accessToken, refreshToken };
};

// Routes

// User Registration with Improved Validation
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const existingUser = await User.findOne({ username });
    if (existingUser) {
      return res.status(409).json({ error: "Username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = new User({ username, password: hashedPassword });
    await user.save();

    await createDefaultChallenges(user._id);

    res.status(201).json({ 
      message: "User registered successfully",
      userId: user._id 
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed" });
  }
});

// Enhanced Login with Refresh Tokens
app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const user = await User.findOne({ username }).select('+password');
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Incorrect password" });
    }

    // Streak logic
    const now = new Date();
    const lastActive = user.lastActive;
    const isNewDay = now.toDateString() !== lastActive.toDateString();
    
    if (isNewDay) {
      const isConsecutive = (now - lastActive) < (24 * 60 * 60 * 1000 * 2);
      user.streak = isConsecutive ? user.streak + 1 : 1;
      user.lastActive = now;
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user._id);
    user.refreshToken = refreshToken;
    await user.save();

    res.json({ 
      accessToken,
      refreshToken,
      user: {
        _id: user._id,
        username: user.username,
        level: user.level,
        xp: user.xp,
        coins: user.coins,
        streak: user.streak,
        inventory: user.inventory,
        title: user.title
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Token Refresh Endpoint
app.post('/auth/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ error: "Refresh token required" });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(decoded.id).select('+refreshToken');
    
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(403).json({ error: "Invalid refresh token" });
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user._id);
    user.refreshToken = newRefreshToken;
    await user.save();

    res.json({ accessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("Refresh error:", err);
    res.status(403).json({ error: "Invalid refresh token" });
  }
});

// Get Current User Profile
app.get('/users/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select('-password -refreshToken')
      .populate('friends', 'username level title');
      
    res.json(user);
  } catch (err) {
    console.error("Profile error:", err);
    res.status(500).json({ error: "Failed to get profile" });
  }
});

// Get Posts with Pagination
app.get('/posts', authenticateToken, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const posts = await Post.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'username title')
      .populate('comments.userId', 'username');

    const total = await Post.countDocuments();

    res.json({
      posts,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error("Posts error:", err);
    res.status(500).json({ error: "Failed to get posts" });
  }
});

// [Rest of your routes remain similar but with the same improvements...]

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err.name === 'ValidationError') {
    return res.status(400).json({ 
      error: 'Validation Error',
      details: err.errors 
    });
  }
  
  if (err.name === 'MongoError' && err.code === 11000) {
    return res.status(409).json({ 
      error: 'Duplicate Key Error',
      field: Object.keys(err.keyPattern)[0]
    });
  }

  res.status(500).json({ error: 'Internal Server Error' });
});

// Start Server
const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log('Server running on port ${PORT}');
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  server.close(() => process.exit(1));
});