import { useAuth0 } from "@auth0/auth0-react";
import React from "react";
import { NavBarTab } from "./nav-bar-tab";

export const NavBarTabs: React.FC = () => {
  const { isAuthenticated } = useAuth0();

  return (
    <div className="nav-bar__tabs">
      <NavBarTab path="/getting-started" label="start here" />
      <NavBarTab path="/params" label="params" />
      <NavBarTab path="/docker" label="docker" />
      <NavBarTab path="/stack" label="stack" />
      {isAuthenticated && (
        <>
          <NavBarTab path="/packages" label="packages" />
          <NavBarTab path="/admin" label="admin" />
        </>
      )}
      <NavBarTab path="/profile" label="profile" />
    </div>
  );
};
