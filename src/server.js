const express = require('express');
const bodyParser = require('body-parser');
const amqp = require('amqplib');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();
const app = express();
const port = 3000;

app.use(bodyParser.json());

let channel;
let connection;
const messages = {}; // Store messages in memory

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

    // Démarrer la consommation des messages pour le nouvel utilisateur
    consumeMessages(newUser);
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
      res.status(200).json({ message: 'Login successful', user });/* 
      channel.consume(user.queue, (message) => {
        readline.cursorTo(process.stdout, 0); // Move cursor to beginning of line
        readline.clearLine(process.stdout, 1); // Clear line
        const timestamp = new Date().toLocaleTimeString();
        console.log(`Message received [${timestamp}]: ${message.content.toString()}`);
        rl.prompt(true); // Re-print the prompt
      }, { noAck: true }); */
    } else {
      res.status(404).json({ error: 'User not found or incorrect password' });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Route pour envoyer un message
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

    const timestamp = new Date().toLocaleTimeString();
    console.log(`[${user.name} Sent Message][${timestamp}]: ${message}`);
    channel.publish('direct_exchange', receiver.queue, Buffer.from(message));
    res.status(200).json({ message: 'Message sent' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Route pour récupérer les messages
app.get('/receive/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId, 10) }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.status(200).json({ messages: messages[user.id] || [] });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Consommation des messages et stockage
async function consumeMessages(user) {
  await channel.assertQueue(user.queue, { durable: false });
  await channel.bindQueue(user.queue, 'direct_exchange', user.queue);

  channel.consume(user.queue, (message) => {
    if (message !== null) {
      const content = message.content.toString();
      const timestamp = new Date().toLocaleTimeString();
      console.log(`Message received by ${user.name} [${timestamp}]: ${content}`);

      if (!messages[user.id]) {
        messages[user.id] = [];
      }
      messages[user.id].push({ timestamp, content });

      channel.ack(message);
    }
  });
}

// Démarrer le serveur et initialiser RabbitMQ
app.listen(port, async () => {
  await initRabbitMQ();
  // Consommer les messages pour tous les utilisateurs existants
  const users = await prisma.user.findMany();
  users.forEach(user => {
    consumeMessages(user);
  });

  console.log(`Server running on http://localhost:${port}`);
});
