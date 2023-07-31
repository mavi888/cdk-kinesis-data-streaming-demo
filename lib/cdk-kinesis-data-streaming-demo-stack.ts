import * as cdk from 'aws-cdk-lib';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Stream, StreamMode } from 'aws-cdk-lib/aws-kinesis';
import { CfnPipe } from 'aws-cdk-lib/aws-pipes';
import { Construct } from 'constructs';

export class CdkKinesisDataStreamingDemoStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props?: cdk.StackProps) {
		super(scope, id, props);

		const sourceStream = new Stream(this, 'sourceStream', {
			streamName: 'source-data-stream',
			streamMode: StreamMode.ON_DEMAND,
		});

		const analyticsStream = new Stream(this, 'analyticsStream', {
			streamName: 'analytics-data-stream',
			streamMode: StreamMode.ON_DEMAND,
		});

		const analyticsPipeRole = new Role(this, 'AnalyticsPipeRole', {
			assumedBy: new ServicePrincipal('pipes.amazonaws.com'),
		});
		sourceStream.grantRead(analyticsPipeRole);
		analyticsStream.grantWrite(analyticsPipeRole);

		const analyticsPipe = new CfnPipe(this, 'analyticsPipe', {
			roleArn: analyticsPipeRole.roleArn,
			source: sourceStream.streamArn,
			target: analyticsStream.streamArn,
			sourceParameters: {
				filterCriteria: {
					filters: [
						{
							pattern: '{"data": {"event_type": ["ANALYTICS"] }}',
						},
					],
				},
				kinesisStreamParameters: {
					startingPosition: 'LATEST',
				},
			},
			targetParameters: {
				inputTemplate:
					'{"event_type": <$.data.event_type>, "data": <$.data.some_data>, "partitionKey": <$.partitionKey>}',
				kinesisStreamParameters: {
					partitionKey: '$.partitionKey',
				},
			},
		});
	}
}
