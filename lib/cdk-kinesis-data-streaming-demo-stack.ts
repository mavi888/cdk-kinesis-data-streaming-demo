import * as cdk from 'aws-cdk-lib';
import { Stream, StreamMode } from 'aws-cdk-lib/aws-kinesis';
import {
	Code,
	EventSourceMapping,
	Function,
	Runtime,
	StartingPosition,
} from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
import path = require('path');

export class CdkKinesisDataStreamingDemoStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const stream = new Stream(this, 'KDS', {
			streamName: 'my-kinesis-data-stream',
			streamMode: StreamMode.ON_DEMAND,
		});

		const kdsProducerFunction = new Function(this, 'kdsProducerFunction', {
			runtime: Runtime.NODEJS_18_X,
			handler: 'producer.handler',
			code: Code.fromAsset(path.join(__dirname, '../functions')),
			environment: {
				STREAM_NAME: stream.streamName,
			},
		});

		stream.grantWrite(kdsProducerFunction);

		const kdsConsumerFunction = new Function(this, 'kdsConsumerFunction', {
			runtime: Runtime.NODEJS_18_X,
			handler: 'consumer.handler',
			code: Code.fromAsset(path.join(__dirname, '../functions')),
		});

		new EventSourceMapping(this, 'KDSConsumerFunctionEvent', {
			target: kdsConsumerFunction,
			batchSize: 1,
			startingPosition: StartingPosition.LATEST,
			eventSourceArn: stream.streamArn,
		});

		stream.grantRead(kdsConsumerFunction);
	}
}
