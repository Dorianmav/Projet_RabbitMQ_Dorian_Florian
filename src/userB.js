const amqp = require('amqplib');
const readline = require('readline');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function startUser(userId) {
  // Retrieve user information from the database
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  const user1 = await prisma.user.findUnique({
    where: { id: 1 }
  });

  if (!user) {
    console.error(`User with ID ${userId} not found.`);
    process.exit(1);
  }

  const connection = await amqp.connect('amqp://localhost');
  const channel = await connection.createChannel();
  const exchange = 'direct_exchange';

  await channel.assertExchange(exchange, 'direct', { durable: false });
  await channel.assertQueue(user.queue, { durable: false });
  await channel.bindQueue(user.queue, exchange, 'user1_key');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  async function sendMessage() {
    rl.question(`Send message to ${user1.name} (or "exit" to quit): ` , async (message) => {
      if (message.trim().toLowerCase() === 'exit') {
        rl.close();
        await connection.close();
        process.exit(0);
      } else {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${user1.name} Received Message][${timestamp}]: ${message}`);
        channel.publish(exchange, 'user2_key', Buffer.from(message));
        await sendMessage();
      }
    });
  }

  async function receiveMessage() {
    channel.consume(user.queue, (message) => {
      readline.cursorTo(process.stdout, 0); // Move cursor to beginning of line
      readline.clearLine(process.stdout, 1); // Clear line
      const timestamp = new Date().toLocaleTimeString();
      console.log(`Message received from ${user1.name} [${timestamp}]: ${message.content.toString()}`);
      rl.prompt(true); // Re-print the prompt
    }, { noAck: true });
  }

  await Promise.all([sendMessage(), receiveMessage()]);
}

// Replace with the actual user ID
const userId = 2;
startUser(userId).catch(console.error);
