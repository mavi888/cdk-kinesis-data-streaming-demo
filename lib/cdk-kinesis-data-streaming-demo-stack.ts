import * as cdk from 'aws-cdk-lib';
import { Stream, StreamMode } from 'aws-cdk-lib/aws-kinesis';
import { Construct } from 'constructs';

export class CdkKinesisDataStreamingDemoStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const stream = new Stream(this, 'KDS', {
			streamName: 'my-kinesis-data-stream',
			streamMode: StreamMode.ON_DEMAND,
		});
	}
}
