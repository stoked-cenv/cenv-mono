import { useAuth0 } from "@auth0/auth0-react";
import React from "react";
import { CodeSnippet } from "../components/code-snippet";
import { PageLayout } from "../components/page-layout";

export const GettingStartedPage: React.FC = () => {
  const { user } = useAuth0();

  if (!user) {
    return null;
  }


  return (
    <PageLayout>
      <div className="content-layout">
        <h1 id="page-title" className="content__title">
          getting started
        </h1>
        <div className="content__body">
          <p id="page-description">
            <span>To get started install the cli:

              pnpm
              <input
                value="pnpm i -g @stoked-cenv/cli"
                disabled
                type="text"
              /><br/>

              yarn
              <input
                value="yarn add global @stoked-cenv/cli"
                disabled
                type="text"
              /><br/>

              npm
              <input
                value="npm i -g @stoked-cenv/cli"
                disabled
                type="text"
              /><br/>

            </span>
            <span>
              <strong>Only authenticated users can access this page.</strong>
            </span>
          </p>
            <div className="profile__details">
              <CodeSnippet
                title="Decoded ID Token"
                code={JSON.stringify(user, null, 2)}
              />
            </div>
        </div>
      </div>
    </PageLayout>
  );
};
