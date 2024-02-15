/** @jsxImportSource @emotion/react */

import React, {
  createContext,
  Dispatch,
  ReactNode,
  SetStateAction,
  useCallback,
  useState,
} from 'react';
import IdentityManager from '@arcgis/core/identity/IdentityManager';
import Portal from '@arcgis/core/portal/Portal';

type AuthenticationType = {
  hasCheckedSignInStatus: boolean;
  setHasCheckedSignInStatus: Dispatch<SetStateAction<boolean>>;
  oAuthInfo: __esri.OAuthInfo | null;
  setOAuthInfo: Dispatch<SetStateAction<__esri.OAuthInfo | null>>;
  portal: __esri.Portal | null;
  setPortal: Dispatch<SetStateAction<__esri.Portal | null>>;
  signedIn: boolean;
  setSignedIn: Dispatch<SetStateAction<boolean>>;
  signIn: () => void;
  userInfo: any;
  setUserInfo: Dispatch<SetStateAction<any>>;
};

export const AuthenticationContext = createContext<AuthenticationType>({
  hasCheckedSignInStatus: false,
  setHasCheckedSignInStatus: () => {},
  oAuthInfo: null,
  setOAuthInfo: () => {},
  portal: null,
  setPortal: () => {},
  signedIn: false,
  setSignedIn: () => {},
  signIn: () => {},
  userInfo: null,
  setUserInfo: () => {},
});

type Props = { children: ReactNode };

export function AuthenticationProvider({ children }: Props) {
  const [
    hasCheckedSignInStatus,
    setHasCheckedSignInStatus, //
  ] = useState(false);
  const [
    oAuthInfo,
    setOAuthInfo, //
  ] = useState<__esri.OAuthInfo | null>(null);
  const [portal, setPortal] = useState<__esri.Portal | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);

  const signIn = useCallback(() => {
    if (!oAuthInfo) return;

    IdentityManager.getCredential(`${oAuthInfo.portalUrl}/sharing`, {
      oAuthPopupConfirmation: false,
    })
      .then(() => {
        setHasCheckedSignInStatus(true);
        setSignedIn(true);

        const portal = new Portal();
        portal.authMode = 'immediate';
        portal.load().then(() => {
          setPortal(portal);
        });
      })
      .catch((err) => {
        console.error(err);
        setHasCheckedSignInStatus(true);
        setPortal(null);
        setSignedIn(false);
      });
  }, [oAuthInfo]);

  return (
    <AuthenticationContext.Provider
      value={{
        hasCheckedSignInStatus,
        setHasCheckedSignInStatus,
        oAuthInfo,
        setOAuthInfo,
        portal,
        setPortal,
        signedIn,
        setSignedIn,
        signIn,
        userInfo,
        setUserInfo,
      }}
    >
      {children}
    </AuthenticationContext.Provider>
  );
}
