const { KinesisClient, PutRecordCommand } = require('@aws-sdk/client-kinesis');
const client = new KinesisClient();

exports.handler = async (event) => {
	const data = {
		foo: 'bar',
	};
	const params = {
		Data: Buffer.from(JSON.stringify(data)),
		PartitionKey: 'Partition1',
		StreamName: process.env.STREAM_NAME,
	};

	console.log(params);

	try {
		const data = await client.send(new PutRecordCommand(params));
		console.log('Success, data sent to Kinesis', data);
		return data;
	} catch (err) {
		console.log('Error', err);
	}

	return data;
};
