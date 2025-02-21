import amqp from 'amqplib';

async function sendMessage(data:any) {
    const connection = await amqp.connect('amqp://localhost'); // Connect to RabbitMQ
    const channel = await connection.createChannel();          // Create a channel

    const queue = 'chattings';                                  // Name of the queue

    // Assert that the queue exists
    await channel.assertQueue(queue, {
        durable: true,      // Make sure the queue survives RabbitMQ restarts
    });

    const message = JSON.stringify(data);
    channel.sendToQueue(queue, Buffer.from(message), { persistent: true });

    console.log("Task sent to queue : ",message)

    // Close the channel and connection
    await channel.close();
    await connection.close();
}


// sendMessage().catch(console.error);

export default sendMessage
