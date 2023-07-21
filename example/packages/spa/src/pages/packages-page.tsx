import React, { useEffect, useState } from "react";
import { CodeSnippet } from "../components/code-snippet";
import { PageLayout } from "../components/page-layout";
import { getPublicResource } from "../services/message.service";

export const PackagesPage: React.FC = () => {
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const getMessage = async () => {
      const { data, error } = await getPublicResource();

      if (!isMounted) {
        return;
      }

      if (data) {
        setMessage(JSON.stringify(data, null, 2));
      }

      if (error) {
        setMessage(JSON.stringify(error, null, 2));
      }
    };

    getMessage();


    return () => {
      isMounted = false;
    };
  }, []);

  const packageJsonSnippit =
`{
  "name": "@your-company/api",
  "version": "0.0.1",
  "...": "...",
  "deployDependencies": [
    "@stoked-cenv/cdk#network",
    "@stoked-cenv/cdk#cert@cenv"
  ],
  "destroyDependencies": [
    "@stoked-cenv/cdk#cert@cenv"
  ],
  "cenv": {
    "stack": {
      "package": "@stoked-cenv/cdk#api",
      "assignedSubDomain": "api.cenv"
    },
    "docker": {
      "context": "../..",
      "file": "./Dockerfile"
    }
  }
}`

  return (
    <PageLayout>
      <div className="content-layout">
        <h1 id="page-title" className="content__title">
          @stoked-cenv/cdk
        </h1>
        <div className="content__body">
          <p id="page-description">
            <span>
              The @stoked-cenv/cdk package provides several key components for getting your code deployed. The provided components are:
              <ul>
                <li>network - consists primarily of a VPC to manage your cloud's network traffic</li>
                <li>cert - provide certificates for security (https)</li>
                <li>spa - provides a mechanism to deploy a Single Page Application via Cloud Front and S3</li>
                <li>api - allows the ability to generate a docker container for your code and deploy it via ECS Fargate</li>
              </ul>retrieves a <strong>public message</strong> from an
              external API.
            </span>
            <span>
              <strong>Any visitor can access this page.</strong>
            </span>
          </p>
          <CodeSnippet title="package.json" code={packageJsonSnippit} />
        </div>
      </div>
    </PageLayout>
  );
};
