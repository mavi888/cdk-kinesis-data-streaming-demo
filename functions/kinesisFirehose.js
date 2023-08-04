//import aws-sdk
const AWS = require('aws-sdk');
const comprehend = new AWS.Comprehend();
const uuid = require('uuid');

exports.handler = async function (event) {
	const records = event.records;

	const outputRecords = [];

	await Promise.all(
		records.map(async (record) => {
			const outputRecord = await processRecord(record);
			outputRecords.push(outputRecord);
		})
	);

	return { records: outputRecords };
};

async function processRecord(record) {
	// decode base64
	const payload = Buffer.from(record.data, 'base64').toString();
	const parsedPayload = JSON.parse(payload);

	console.log(parsedPayload);

	// Call aws comprehend to detect sentiment - or do what ever you want per registry
	const params = {
		LanguageCode: 'en',
		Text: parsedPayload.data,
	};

	console.log(params);

	const result = await comprehend.detectSentiment(params).promise();
	const sentiment = result.Sentiment;

	const newPayload = {
		id: uuid.v4(),
		sentiment: sentiment,
		data: parsedPayload.data,
	};

	const stringPayload = JSON.stringify(newPayload);

	console.log(stringPayload);

	//encode result to base64
	const outputRecord = {
		recordId: record.recordId,
		result: 'Ok',
		data: Buffer.from(stringPayload).toString('base64'),
	};

	return outputRecord;
}
