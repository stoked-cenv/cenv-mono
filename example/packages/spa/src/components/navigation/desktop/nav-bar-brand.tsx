import React from "react";
import { NavLink } from "react-router-dom";

export const NavBarBrand: React.FC = () => {
  return (
    <div className="nav-bar__brand">
      <NavLink to="/">
        cenv
      </NavLink>
    </div>
  );
};
