import {
  AuthorizationType,
  FieldLogLevel,
  GraphqlApi,
  MappingTemplate,
  Schema,
} from "@aws-cdk/aws-appsync";
import {
  AllowedMethods,
  CachePolicy,
  Distribution,
} from "@aws-cdk/aws-cloudfront";
import { HttpOrigin } from "@aws-cdk/aws-cloudfront-origins";
import { ServicePrincipal } from "@aws-cdk/aws-iam";
import { Code, Function, Runtime } from "@aws-cdk/aws-lambda";
import { App, CfnOutput, Duration, Fn, Stack } from "@aws-cdk/core";

const app = new App();
const stack = new Stack(app, "AWSDemoAppSyncCloudFrontStack");

const apiAuthorizationHandler = new Function(
  stack,
  "GraphQLApiAuthorizationFunction",
  {
    // allow all incoming requests for demo purposes
    code: Code.fromInline(
      "exports.handler = async () => ({ isAuthorized: true })"
    ),
    handler: "index.handler",
    runtime: Runtime.NODEJS_14_X,
  }
);

apiAuthorizationHandler.addPermission("AppSync", {
  principal: new ServicePrincipal("appsync.amazonaws.com"),
});

const api = new GraphqlApi(stack, "GraphQLApi", {
  authorizationConfig: {
    defaultAuthorization: {
      authorizationType: AuthorizationType.LAMBDA,
      lambdaAuthorizerConfig: {
        handler: apiAuthorizationHandler,
        resultsCacheTtl: Duration.hours(1),
      },
    },
  },
  logConfig: {
    fieldLogLevel: FieldLogLevel.ALL,
  },
  name: stack.stackName + "GraphQLApi",
  schema: Schema.fromAsset("./schema.graphql"),
});

const noneDataSource = api.addNoneDataSource("NoneDataSource");

api.createResolver({
  dataSource: noneDataSource,
  fieldName: "message",
  requestMappingTemplate: MappingTemplate.fromString(
    '{ "version": "2018-05-29", "payload": "Hello World!" }'
  ),
  responseMappingTemplate: MappingTemplate.fromString(
    "$util.toJson($context.result)"
  ),
  typeName: "Query",
});

const innerDistribution = new Distribution(stack, "InnerDistribution", {
  comment: stack.stackName + "InnerDistribution",
  defaultBehavior: {
    allowedMethods: AllowedMethods.ALLOW_ALL,
    cachePolicy: CachePolicy.CACHING_DISABLED,
    origin: new HttpOrigin(Fn.select(2, Fn.split("/", api.graphqlUrl)), {
      customHeaders: {
        // always attach authorization header for demo purposes
        authorization: "demo-authorization-header",
      },
    }),
  },
});

new CfnOutput(stack, "InnerDistributionDomainName", {
  value: innerDistribution.distributionDomainName,
});

const outerDistribution = new Distribution(stack, "OuterDistribution", {
  comment: stack.stackName + "OuterDistribution",
  defaultBehavior: {
    allowedMethods: AllowedMethods.ALLOW_ALL,
    cachePolicy: CachePolicy.CACHING_DISABLED,
    origin: new HttpOrigin(innerDistribution.distributionDomainName),
  },
});

new CfnOutput(stack, "OuterDistributionDomainName", {
  value: outerDistribution.distributionDomainName,
});
