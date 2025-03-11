import amqp from 'amqplib';

let connection: amqp.Connection | null = null;
let channel: amqp.Channel | null = null;

const setupRabbitMQ = async () => {
    try {
        if (!connection) {
            connection = await amqp.connect('amqp://localhost');
        }
        if (!channel) {
            channel = await connection.createChannel();
            const exchange = 'chat-app';

            // Declare the exchange
            await channel.assertExchange(exchange, 'direct', { durable: true });

            // Declare and bind the queues
            await channel.assertQueue('chat-insert', { durable: true });
            await channel.assertQueue('chat-update', { durable: true });

            await channel.bindQueue('chat-insert', exchange, 'insert');
            await channel.bindQueue('chat-update', exchange, 'update');

        }
    } catch (error) {
        console.error('RabbitMQ setup error:', error);
    }
};

const sendMessage = async (message: any, queueType: 'insert' | 'update') => {
    try {
        if (!channel) await setupRabbitMQ();

        const exchange = 'chat-app';
        const routingKey = queueType === 'insert' ? 'insert' : 'update';

        channel!.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), {
            persistent: true,
        });

        console.log(`Sent message to ${queueType} queue:`, message);
    } catch (error) {
        console.error('Error sending message:', error);
    }
};

// Close connection on app exit
process.on('exit', async () => {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('RabbitMQ connection closed.');
});

export default sendMessage;
