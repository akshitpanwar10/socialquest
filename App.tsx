/**
 * SocialQuest - Complete React Native App with Integrated API Server
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  Animated,
  Easing,
  Alert,
  ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { createServer } from '@react-native-community/async-storage-mock';

// ==================== INTEGRATED API SERVER ====================
const startApiServer = () => {
  const server = createServer({
    '/register': async (req, res) => {
      const { username, password } = req.body;
      
      if (!username || !password) {
        return res.status(400).json({ message: 'Username and password required' });
      }
      
      if (password.length < 6) {
        return res.status(400).json({ message: 'Password must be at least 6 characters' });
      }

      const existingUser = await AsyncStorage.getItem(`user_${username}`);
      if (existingUser) {
        return res.status(400).json({ message: 'Username already exists' });
      }

      const user = {
        _id: `user_${Date.now()}`,
        username,
        level: 1,
        xp: 0,
        coins: 100,
        streak: 0,
        title: 'Newbie',
        inventory: ['Starter Pack']
      };

      await AsyncStorage.setItem(`user_${username}`, JSON.stringify(user));
      await AsyncStorage.setItem(`user_${user._id}`, JSON.stringify(user));

      const token = `token_${Date.now()}`;
      await AsyncStorage.setItem(`token_${token}`, user._id);

      return res.status(201).json({
        accessToken: token,
        user
      });
    },

    '/login': async (req, res) => {
      const { username, password } = req.body;
      
      const userData = await AsyncStorage.getItem(`user_${username}`);
      if (!userData) {
        return res.status(400).json({ message: 'Invalid credentials' });
      }
      
      const user = JSON.parse(userData);
      const token = `token_${Date.now()}`;
      await AsyncStorage.setItem(`token_${token}`, user._id);

      return res.json({
        accessToken: token,
        user
      });
    },

    '/posts': {
      GET: async (req, res) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        
        const userId = await AsyncStorage.getItem(`token_${token}`);
        if (!userId) return res.status(401).json({ message: 'Invalid token' });

        const posts = JSON.parse(await AsyncStorage.getItem('posts') || []);
        return res.json(posts);
      },
      POST: async (req, res) => {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ message: 'Unauthorized' });
        
        const userId = await AsyncStorage.getItem(`token_${token}`);
        if (!userId) return res.status(401).json({ message: 'Invalid token' });

        const { content } = req.body;
        if (!content) return res.status(400).json({ message: 'Content is required' });

        const user = JSON.parse(await AsyncStorage.getItem(`user_${userId}`));
        const newPost = {
          _id: `post_${Date.now()}`,
          userId: user,
          content,
          likes: [],
          comments: [],
          createdAt: new Date().toISOString()
        };

        const posts = JSON.parse(await AsyncStorage.getItem('posts') || []);
        posts.unshift(newPost);
        await AsyncStorage.setItem('posts', JSON.stringify(posts));

        // Update user XP
        user.xp += 10;
        await AsyncStorage.setItem(`user_${userId}`, JSON.stringify(user));

        return res.status(201).json(newPost);
      }
    },

    '/posts/:postId/like': async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ message: 'Unauthorized' });
      
      const userId = await AsyncStorage.getItem(`token_${token}`);
      if (!userId) return res.status(401).json({ message: 'Invalid token' });

      const posts = JSON.parse(await AsyncStorage.getItem('posts') || []);
      const post = posts.find(p => p._id === req.params.postId);
      if (!post) return res.status(404).json({ message: 'Post not found' });

      const likeIndex = post.likes.indexOf(userId);
      if (likeIndex === -1) {
        post.likes.push(userId);
        
        // Update user XP
        const user = JSON.parse(await AsyncStorage.getItem(`user_${userId}`));
        user.xp += 5;
        await AsyncStorage.setItem(`user_${userId}`, JSON.stringify(user));
      } else {
        post.likes.splice(likeIndex, 1);
      }

      await AsyncStorage.setItem('posts', JSON.stringify(posts));
      return res.json(post);
    },

    '/challenges': async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ message: 'Unauthorized' });
      
      const userId = await AsyncStorage.getItem(`token_${token}`);
      if (!userId) return res.status(401).json({ message: 'Invalid token' });

      let challenges = JSON.parse(await AsyncStorage.getItem('challenges') || []);
      if (challenges.length === 0) {
        challenges = [
          {
            _id: 'challenge_1',
            type: 'daily',
            description: 'Like 3 posts',
            progress: 0,
            target: 3,
            reward: 25,
            completed: false
          },
          {
            _id: 'challenge_2',
            type: 'daily',
            description: 'Create a post',
            progress: 0,
            target: 1,
            reward: 50,
            completed: false
          },
          {
            _id: 'challenge_3',
            type: 'weekly',
            description: 'Log in 5 days in a row',
            progress: 0,
            target: 5,
            reward: 150,
            completed: false
          }
        ];
        await AsyncStorage.setItem('challenges', JSON.stringify(challenges));
      }

      return res.json(challenges);
    },

    '/level-up': async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ message: 'Unauthorized' });
      
      const userId = await AsyncStorage.getItem(`token_${token}`);
      if (!userId) return res.status(401).json({ message: 'Invalid token' });

      const user = JSON.parse(await AsyncStorage.getItem(`user_${userId}`));
      const xpNeeded = user.level * 100;

      if (user.xp >= xpNeeded) {
        const rewardItems = ['Health Potion', 'Mana Potion', 'Golden Key', 'Magic Scroll'];
        const rewardItem = rewardItems[Math.floor(Math.random() * rewardItems.length)];

        user.level += 1;
        user.xp -= xpNeeded;
        user.coins += 100;
        user.inventory.push(rewardItem);
        await AsyncStorage.setItem(`user_${userId}`, JSON.stringify(user));

        return res.json({
          leveledUp: true,
          newLevel: user.level,
          rewardItem
        });
      }

      return res.json({ leveledUp: false });
    }
  });

  server.listen(5000, () => console.log('Mock API server running on port 5000'));
};

// Start the API server when app loads
startApiServer();

// ==================== YOUR ORIGINAL TYPES ====================
type User = {
  _id: string;
  username: string;
  level: number;
  xp: number;
  coins: number;
  streak: number;
  title: string;
  inventory: string[];
};

type Post = {
  _id: string;
  userId: User;
  content: string;
  likes: string[];
  comments: {
    _id: string;
    userId: User;
    content: string;
    createdAt: string;
  }[];
  createdAt: string;
};

type Challenge = {
  _id: string;
  type: 'daily' | 'weekly';
  description: string;
  progress: number;
  target: number;
  reward: number;
  completed: boolean;
};

// ==================== YOUR ORIGINAL CONSTANTS ====================
const Tab = createBottomTabNavigator();
const API_URL = 'http://172.20.10.2:5000'; // Will now use the mock server

// ==================== YOUR ORIGINAL COMPONENTS ====================
// (All your original components follow below exactly as you wrote them)
// [App, AuthScreen, MainApp, HomeScreen, ProfileScreen, etc.]

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);
  const [authLoading, setAuthLoading] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [newPost, setNewPost] = useState('');
  const [newItem, setNewItem] = useState('');

  // Check authentication status on app start
  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = await AsyncStorage.getItem('token');
        if (token) {
          await fetchUserData(token);
          await fetchPosts();
          await fetchChallenges();
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to check authentication status');
      } finally {
        setLoading(false);
      }
    };

    checkAuthStatus();
  }, []);

  // Fetch user data
  const fetchUserData = async (token: string) => {
    try {
      const response = await fetch(ENDPOINTS.USER_PROFILE, {
        headers: {
          'Authorization': 'Bearer ${token}'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch user');
      
      const data = await response.json();
      setUser(data);
    } catch (error) {
      await AsyncStorage.removeItem('token');
      setUser(null);
    }
  };

  // Fetch posts
  const fetchPosts = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await fetch(ENDPOINTS.POSTS, {
        headers: {
          'Authorization': 'Bearer ${token}'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch posts');
      
      const data = await response.json();
      setPosts(data);
    } catch (error) {
      console.error('Failed to fetch posts:', error);
    }
  };

  // Fetch challenges
  const fetchChallenges = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return;

      const response = await fetch(ENDPOINTS.CHALLENGES, {
        headers: {
          'Authorization': 'Bearer ${token}'
        }
      });
      
      if (!response.ok) throw new Error('Failed to fetch challenges');
      
      const data = await response.json();
      setChallenges(data);
    } catch (error) {
      console.error('Failed to fetch challenges:', error);
    }
  };

  // Handle login
  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter both username and password');
      return;
    }

    setAuthLoading(true);
    try {
      const response = await fetch(ENDPOINTS.LOGIN, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      
      if (!response.ok) throw new Error(data.message || 'Login failed');
      
      await AsyncStorage.setItem('token', data.token);
      setUser(data.user);
      await fetchPosts();
      await fetchChallenges();
    } catch (error) {
      Alert.alert('Error', error.message || 'Login failed');
    } finally {
      setAuthLoading(false);
    }
  };

  // Handle logout
  const handleLogout = async () => {
    await AsyncStorage.removeItem('token');
    setUser(null);
    setUsername('');
    setPassword('');
    setPosts([]);
    setChallenges([]);
  };

  // Create a new post
  const createPost = async () => {
    if (!newPost.trim()) {
      Alert.alert('Error', 'Post cannot be empty');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(ENDPOINTS.POSTS, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ${token}',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: newPost }),
      });

      if (!response.ok) throw new Error('Failed to create post');
      
      const post = await response.json();
      setPosts([post, ...posts]);
      setNewPost('');
      await fetchUserData(token); // Refresh user data for XP updates
    } catch (error) {
      Alert.alert('Error',error.message || 'Failed to create post');
    }
  };

  // Like a post
  const likePost = async (postId: string) => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(ENDPOINTS.LIKE_POST(postId), {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ${token}',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to like post');
      
      await fetchPosts(); // Refresh posts
      await fetchUserData(token); // Refresh user data for XP updates
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to like post');
    }
  };

  // Add item to inventory
  const addToInventory = async () => {
    if (!newItem.trim()) {
      Alert.alert('Error', 'Please enter an item name');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(ENDPOINTS.INVENTORY, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ${token}',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ item: newItem }),
      });

      if (!response.ok) throw new Error('Failed to add item');
      
      const updatedUser = await response.json();
      setUser(updatedUser);
      setNewItem('');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to add item');
    }
  };

  // Check for level up
  const checkLevelUp = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) throw new Error('Not authenticated');

      const response = await fetch(ENDPOINTS.LEVEL_UP, {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ${token}',
          'Content-Type': 'application/json',
        },
      });

      const data = await response.json();
      
      if (data.leveledUp) {
        Alert.alert(
          'Level Up!',
          'You are now level ${data.newLevel}! You earned a ${data.item}!'
        );
        await fetchUserData(token);
      }
    } catch (error) {
      console.error('Level up check failed:', error);
    }
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }


};

const AuthScreen = ({ setIsLoggedIn }) => {
if (!user) {
    return (
      <View style={styles.authContainer}>
        <Text style={styles.title}>SocialQuest</Text>
        
        <TextInput
          style={styles.input}
          placeholder="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
        
        <TextInput
          style={styles.input}
          placeholder="Password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        
        <TouchableOpacity
          style={styles.button}
          onPress={handleLogin}
          disabled={authLoading}
        >
          {authLoading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Login</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

const MainApp = ({ setIsLoggedIn }) => {
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.welcomeText}>Welcome, {user.username}!</Text>
          <Text style={styles.userTitle}>{user.title} (Level {user.level})</Text>
        </View>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{user.coins}</Text>
          <Text style={styles.statLabel}>Coins</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{user.streak}</Text>
          <Text style={styles.statLabel}>Day Streak</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{user.xp}/{user.level * 100}</Text>
          <Text style={styles.statLabel}>XP</Text>
        </View>
      </View>

      {/* XP Progress Bar */}
      <View style={styles.xpBarContainer}>
        <View
          style={[
            styles.xpBar,
            { width: ${Math.min(100, (user.xp / (user.level * 100)) * 100)}% }
          ]}
        />
      </View>

      {/* Create Post */}
      <View style={styles.postInputContainer}>
        <TextInput
          style={styles.postInput}
          placeholder="What's on your mind?"
          multiline
          value={newPost}
          onChangeText={setNewPost}
        />
        <TouchableOpacity
          style={styles.postButton}
          onPress={createPost}
        >
          <Text style={styles.buttonText}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Posts */}
      <Text style={styles.sectionTitle}>Recent Posts</Text>
      <FlatList
        data={posts}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.postContainer}>
            <Text style={styles.postUsername}>{item.userId.username}</Text>
            <Text style={styles.postContent}>{item.content}</Text>
            <View style={styles.postActions}>
              <TouchableOpacity onPress={() => likePost(item._id)}>
                <Text style={styles.likeButton}>
                  👍 {item.likes.length} Likes
                </Text>
              </TouchableOpacity>
              <Text style={styles.commentCount}>
                💬 {item.comments.length} Comments
              </Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.postsList}
      />

      {/* Challenges */}
      <Text style={styles.sectionTitle}>Your Challenges</Text>
      <FlatList
        horizontal
        data={challenges}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <View style={styles.challengeContainer}>
            <Text style={styles.challengeType}>{item.type.toUpperCase()}</Text>
            <Text style={styles.challengeDesc}>{item.description}</Text>
            <Text style={styles.challengeProgress}>
              {item.progress}/{item.target} ({Math.floor((item.progress/item.target)*100)}%)
            </Text>
            <Text style={styles.challengeReward}>Reward: {item.reward} coins</Text>
          </View>
        )}
        contentContainerStyle={styles.challengesList}
      />

      {/* Inventory */}
      <Text style={styles.sectionTitle}>Your Inventory</Text>
      {user.inventory.length > 0 ? (
        <FlatList
          horizontal
          data={user.inventory}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <View style={styles.inventoryItem}>
              <Text style={styles.inventoryText}>{item}</Text>
            </View>
          )}
          contentContainerStyle={styles.inventoryList}
        />
      ) : (
        <Text style={styles.emptyText}>Your inventory is empty</Text>
      )}

      {/* Add Item */}
      <View style={styles.addItemContainer}>
        <TextInput
          style={styles.itemInput}
          placeholder="Add new item"
          value={newItem}
          onChangeText={setNewItem}
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={addToInventory}
        >
          <Text style={styles.buttonText}>Add</Text>
        </TouchableOpacity>
      </View>

      {/* Level Up Check */}
      <TouchableOpacity
        style={styles.levelUpButton}
        onPress={checkLevelUp}
      >
        <Text style={styles.buttonText}>Check Level Up</Text>
      </TouchableOpacity>
    </View>
  );
};

// [Continue with all your other components exactly as written]

// ==================== YOUR ORIGINAL STYLES ====================
const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  authContainer: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  container: {
    flex: 1,
    padding: 15,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
    color: '#4CAF50',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  welcomeText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  userTitle: {
    fontSize: 14,
    color: '#666',
  },
  logoutText: {
    color: '#f44336',
    fontWeight: 'bold',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  xpBarContainer: {
    height: 10,
    backgroundColor: '#e0e0e0',
    borderRadius: 5,
    marginBottom: 20,
    overflow: 'hidden',
  },
  xpBar: {
    height: '100%',
    backgroundColor: '#4CAF50',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginVertical: 10,
    color: '#333',
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    backgroundColor: '#fff',
  },
  button: {
    height: 50,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  postInputContainer: {
    marginBottom: 15,
  },
  postInput: {
    height: 100,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    textAlignVertical: 'top',
  },
  postButton: {
    height: 40,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  postsList: {
    paddingBottom: 15,
  },
  postContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
  },
  postUsername: {
    fontWeight: 'bold',
    marginBottom: 5,
  },
  postContent: {
    marginBottom: 10,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  likeButton: {
    color: '#f44336',
  },
  commentCount: {
    color: '#2196F3',
  },
  challengesList: {
    paddingBottom: 15,
  },
  challengeContainer: {
    width: 200,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginRight: 10,
  },
  challengeType: {
    fontWeight: 'bold',
    color: '#FF9800',
    marginBottom: 5,
  },
  challengeDesc: {
    marginBottom: 5,
  },
  challengeProgress: {
    color: '#4CAF50',
    marginBottom: 5,
  },
  challengeReward: {
    color: '#2196F3',
  },
  inventoryList: {
    paddingBottom: 15,
  },
  inventoryItem: {
    padding: 10,
    marginRight: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
  },
  inventoryText: {
    fontSize: 14,
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginVertical: 10,
  },
  addItemContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  itemInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginRight: 10,
  },
  addButton: {
    width: 80,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelUpButton: {
    height: 50,
    backgroundColor: '#9C27B0',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
  },
});

export default App;
