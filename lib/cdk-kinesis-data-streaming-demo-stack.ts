import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import { EventBus, Match, Rule } from 'aws-cdk-lib/aws-events';
import { CloudWatchLogGroup } from 'aws-cdk-lib/aws-events-targets';
import { Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { Stream, StreamMode } from 'aws-cdk-lib/aws-kinesis';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
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

		const eventBus = new EventBus(this, 'eventBus', {
			eventBusName: 'kinesis-event-bus',
		});

		// All events on the eventBus are written to Amazon CloudWatch Logs for testing
		const catchAllLogRule = new Rule(this, 'catchAllLogRule', {
			ruleName: 'catchAllLogRule',
			eventBus: eventBus,
			eventPattern: {
				source: Match.prefix(''),
			},
			targets: [
				new CloudWatchLogGroup(
					new LogGroup(this, 'kinesisEventBusCatchAllLogGroup', {
						logGroupName:
							'/aws/events/kinesisEventBusCatchAllLogGroup/catchAllLogGroup',
						removalPolicy: RemovalPolicy.DESTROY,
					})
				),
			],
		});

		const edaPipeRole = new Role(this, 'EdaPipeRole', {
			assumedBy: new ServicePrincipal('pipes.amazonaws.com'),
		});

		eventBus.grantPutEventsTo(edaPipeRole);
		sourceStream.grantRead(edaPipeRole);

		const edaPipe = new CfnPipe(this, 'edapPipe', {
			roleArn: edaPipeRole.roleArn,
			source: sourceStream.streamArn,
			sourceParameters: {
				filterCriteria: {
					filters: [
						{
							pattern: '{"data": {"event_type": ["EDA"] }}',
						},
					],
				},
				kinesisStreamParameters: {
					startingPosition: 'LATEST',
				},
			},
			target: eventBus.eventBusArn,
			targetParameters: {
				inputTemplate:
					'{"event_type": <$.data.event_type>, "data": <$.data.some_data>, "partitionKey": <$.partitionKey>}',
			},
		});
	}
}
