import { Injectable } from '@nestjs/common';
import { NormalizedRequirementCategory } from '@polycost/types';

export interface AliasMatch {
  serviceCategory: NormalizedRequirementCategory;
  serviceType: string;
  pattern: RegExp;
}

@Injectable()
export class AliasDictionary {
  private readonly aliases: AliasMatch[] = [
    service('compute', 'vm-compute', /\b(ec2|virtual machine|vm|server|compute instance)\b/i),
    service('compute', 'autoscaling-compute', /\b(auto scaling|autoscale|scale set)\b/i),
    service('containers', 'kubernetes', /\b(kubernetes|k8s|eks|aks|gke)\b/i),
    service('containers', 'container-app', /\b(container|ecs|fargate|cloud run|container app)\b/i),
    service('application', 'serverless-function', /\b(lambda|function app|cloud functions?)\b/i),
    service('application', 'api-management', /\b(api gateway|api management|apim)\b/i),
    service('storage', 'object-storage', /\b(s3|bucket|blob|object storage|gcs)\b/i),
    service(
      'storage',
      'block-storage',
      /\b(ebs|managed disk|persistent disk|block storage|volume)\b/i,
    ),
    service('storage', 'file-storage', /\b(efs|fsx|azure files|filestore|file storage)\b/i),
    service('database', 'managed-postgres', /\b(postgres|postgresql|aurora postgres)\b/i),
    service('database', 'managed-mysql', /\b(mysql|aurora mysql)\b/i),
    service('database', 'managed-sql-server', /\b(sql server|mssql)\b/i),
    service('database', 'nosql-database', /\b(dynamodb|cosmos|firestore|nosql|mongodb)\b/i),
    service('database', 'cache', /\b(redis|elasticache|memorystore|cache)\b/i),
    service('database', 'relational-database', /\b(rds|cloud sql|sql database|database|db)\b/i),
    service('networking', 'load-balancer', /\b(load balancer|alb|elb|nlb|application gateway)\b/i),
    service('networking', 'cdn', /\b(cdn|cloudfront|front door|cloud cdn)\b/i),
    service('networking', 'nat-gateway', /\b(nat gateway|cloud nat)\b/i),
    service('networking', 'dns', /\b(route 53|cloud dns|dns)\b/i),
    service(
      'networking',
      'vpn-or-private-link',
      /\b(vpn|direct connect|expressroute|interconnect)\b/i,
    ),
    service('analytics', 'data-warehouse', /\b(redshift|bigquery|synapse|warehouse)\b/i),
    service('analytics', 'data-lake', /\b(data lake|lakehouse|glue|dataplex)\b/i),
    service('analytics', 'streaming', /\b(kinesis|event hubs|pub\/sub|pubsub|streaming)\b/i),
    service('ai', 'ml-platform', /\b(sagemaker|vertex ai|azure ml|machine learning|ml)\b/i),
    service('ai', 'generative-ai', /\b(bedrock|openai|llm|generative ai|embeddings?)\b/i),
    service(
      'integration',
      'queue-or-event-bus',
      /\b(sqs|sns|service bus|event grid|eventbridge|queue)\b/i,
    ),
    service('security', 'waf', /\b(waf|web application firewall)\b/i),
    service(
      'security',
      'security-monitoring',
      /\b(security hub|defender|guardduty|cloud armor)\b/i,
    ),
    service(
      'operations',
      'monitoring',
      /\b(cloudwatch|monitor|logging|observability|log analytics)\b/i,
    ),
    service('devops', 'container-registry', /\b(ecr|acr|artifact registry|container registry)\b/i),
  ];

  match(label: string): AliasMatch | undefined {
    return this.aliases.find((alias) => alias.pattern.test(label));
  }
}

function service(
  serviceCategory: NormalizedRequirementCategory,
  serviceType: string,
  pattern: RegExp,
): AliasMatch {
  return {
    serviceCategory,
    serviceType,
    pattern,
  };
}
