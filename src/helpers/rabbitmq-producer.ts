import amqp from 'amqplib';

const sendMessage = async (message: any) => {
    try {
        const connection = await amqp.connect('amqp://localhost'); // Connect to RabbitMQ
        const channel = await connection.createChannel(); // Create a channel

        const exchange = 'chat-app'; 
        const routingKey = 'chat-db'; 

      
        await channel.assertExchange(exchange, 'direct', { durable: true });

        channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(message)), {
            persistent: true,
        });

        console.log('Sent message:', message);

        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('Error sending message:', error);
    }
};



export default sendMessage
