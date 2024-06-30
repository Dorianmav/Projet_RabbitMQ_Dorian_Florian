const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const amqp = require('amqplib');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors(
  {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', '*'],
    credentials: true,
  }
))

let channel;
let connection;

// Initialisation de RabbitMQ
async function initRabbitMQ() {
  connection = await amqp.connect('amqp://localhost');
  channel = await connection.createChannel();
  await channel.assertExchange('direct_exchange', 'direct', { durable: false });
}


// Route pour s'inscrire
app.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        queue: name,
      },
    });
    res.status(201).json(newUser);

  } catch (error) {
    res.status(400).json({ error: 'User registration failed' });
  }
});

// Route pour se connecter
app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (user && await bcrypt.compare(password, user.password)) {
      res.status(200).json({ message: 'Login successful', user });

    } else {
      res.status(404).json({ error: 'User not found or incorrect password' });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/send', async (req, res) => {
  const { userId, message, receiverId } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId }
    });

    if (!user || !receiver) {
      return res.status(404).json({ error: 'User or receiver not found' });
    }

    const timestamp = new Date();
    console.log(`[${user.name} Sent Message][${timestamp}]: ${message}`);
    channel.publish('direct_exchange', receiver.queue, Buffer.from(message));

    // Enregistrer le message dans la base de données
    await prisma.message.create({
      data: {
        content: message,
        timestamp: timestamp,
        senderId: userId,
        receiverId: receiverId
      }
    });

    res.status(200).json({ message: 'Message sent' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/conversation/:users', async (req, res) => {
  let users = req.params.users.split('+');
  const [userId1, userId2 ] = users;

  try {
    const user1 = await prisma.user.findUnique({
      where: { id: parseInt(userId1, 10) }
    });

    const user2 = await prisma.user.findUnique({
      where: { id: parseInt(userId2, 10) }
    });

    if (!user1 || !user2) {
      return res.status(404).json({ error: 'One or both users not found' });
    }

    const conversation = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: user1.id, receiverId: user2.id },
          { senderId: user2.id, receiverId: user1.id }
        ]
      },
      orderBy: {
        timestamp: 'asc'
      }
    });

    res.status(200).json({ conversation });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.status(200).json({ users });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// Démarrer le serveur et initialiser RabbitMQ
app.listen(port, async () => {
  await initRabbitMQ();

  console.log(`Server running on http://localhost:${port}`);
});
