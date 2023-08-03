import * as cdk from 'aws-cdk-lib';
import { RemovalPolicy } from 'aws-cdk-lib';
import { EventBus, Match, Rule } from 'aws-cdk-lib/aws-events';
import { CloudWatchLogGroup } from 'aws-cdk-lib/aws-events-targets';
import {
	Effect,
	PolicyDocument,
	PolicyStatement,
	Role,
	ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Stream, StreamMode } from 'aws-cdk-lib/aws-kinesis';
import { CfnDeliveryStream } from 'aws-cdk-lib/aws-kinesisfirehose';
import { LogGroup, LogStream, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { CfnPipe } from 'aws-cdk-lib/aws-pipes';
import { Bucket } from 'aws-cdk-lib/aws-s3';
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

		// Kinesis Firehose destination bucket
		const firehoseDestinationBucket = new Bucket(
			this,
			'analyticsDestinationBucket',
			{
				removalPolicy: RemovalPolicy.DESTROY,
				autoDeleteObjects: true,
			}
		);

		// log group for kinesis firehose errors
		const logGroup = new LogGroup(this, 'analyticsKinesisFirehoseLogGroup', {
			logGroupName: 'Analytics-KinesisFirehoseLogGroup',
			removalPolicy: RemovalPolicy.DESTROY,
			retention: RetentionDays.FIVE_DAYS,
		});

		// create a log stream for firehose
		const logStream = new LogStream(this, 'analyticsKinesisFirehoseLogStream', {
			logGroup: logGroup,
			logStreamName: 'Analytics-KinesisFirehoseLogStream',
			removalPolicy: RemovalPolicy.DESTROY,
		});

		// give permissions to firehose to put logs
		const cloudWatchPolicy = new PolicyDocument({
			statements: [
				new PolicyStatement({
					actions: ['logs:PutLogEvents'],
					effect: Effect.ALLOW,
					resources: [
						`${logGroup.logGroupArn}:log-stream:${logStream.logStreamName}`,
					],
				}),
			],
		});

		const streamPolicy = new PolicyDocument({
			statements: [
				new PolicyStatement({
					actions: ['kinesis:DescribeStream'],
					effect: Effect.ALLOW,
					resources: [analyticsStream.streamArn],
				}),
			],
		});

		// IAM Role for Kinesis firehose
		const kinesisfirehoseRole = new Role(this, 'analyticsKinesisFirehoseRole', {
			roleName: 'analytics-kinesis-firehose-role',
			assumedBy: new ServicePrincipal('firehose.amazonaws.com'),
			inlinePolicies: {
				cloudWatchPolicy,
				streamPolicy,
			},
		});

		// Grant permissions to the role to put objects in the bucket
		firehoseDestinationBucket.grantPut(kinesisfirehoseRole);
		firehoseDestinationBucket.grantWrite(kinesisfirehoseRole);

		analyticsStream.grantReadWrite(kinesisfirehoseRole);

		const kinesisFirehose = new CfnDeliveryStream(
			this,
			'analyticsKinesisFirehose',
			{
				deliveryStreamName: 'analytics-kinesis-firehose',
				deliveryStreamType: 'KinesisStreamAsSource',
				kinesisStreamSourceConfiguration: {
					kinesisStreamArn: analyticsStream.streamArn,
					roleArn: kinesisfirehoseRole.roleArn,
				},
				s3DestinationConfiguration: {
					bucketArn: firehoseDestinationBucket.bucketArn,
					roleArn: kinesisfirehoseRole.roleArn,
					cloudWatchLoggingOptions: {
						enabled: true,
						logGroupName: logGroup.logGroupName,
						logStreamName: logStream.logStreamName,
					},
				},
			}
		);
	}
}
