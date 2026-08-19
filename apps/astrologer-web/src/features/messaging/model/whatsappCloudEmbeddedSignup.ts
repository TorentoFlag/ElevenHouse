import type {
  CompleteWhatsAppCloudConnectionBody,
  StartWhatsAppCloudConnectionResponse
} from "@elevenhouse/contracts";

export type WhatsAppCloudEmbeddedSignupSession =
  CompleteWhatsAppCloudConnectionBody["session"];

export type WhatsAppCloudEmbeddedSignupResult = {
  readonly code: string;
  readonly session: WhatsAppCloudEmbeddedSignupSession;
};

export type WhatsAppCloudEmbeddedSignupLauncher = (
  input: StartWhatsAppCloudConnectionResponse
) => Promise<WhatsAppCloudEmbeddedSignupResult>;

type FacebookLoginOptions = {
  readonly config_id: string;
  readonly response_type: "code";
  readonly override_default_response_type: true;
  readonly state: string;
  readonly extras: {
    readonly version: "v3";
    readonly featureType: "whatsapp_business_app_onboarding";
  };
};

type FacebookLoginResponse = {
  readonly authResponse?: {
    readonly code?: string;
  };
};

type FacebookSdk = {
  readonly init: (input: {
    readonly appId: string;
    readonly autoLogAppEvents: boolean;
    readonly xfbml: boolean;
    readonly version: string;
  }) => void;
  readonly login: (
    callback: (response: FacebookLoginResponse) => void,
    options: FacebookLoginOptions
  ) => void;
};

type BrowserWindow = Window &
  typeof globalThis & {
    readonly FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  };

export async function launchWhatsAppCloudEmbeddedSignup(
  input: StartWhatsAppCloudConnectionResponse
): Promise<WhatsAppCloudEmbeddedSignupResult> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("WhatsApp Embedded Signup is available only in a browser");
  }

  const browserWindow = window as BrowserWindow;
  const facebook = await loadFacebookSdk(browserWindow, document, input);
  const sessionPromise = waitForWhatsAppCloudEmbeddedSignupSession(browserWindow, 300_000);
  const codePromise = loginWithFacebookForBusiness(facebook, input);
  const [code, session] = await Promise.all([codePromise, sessionPromise]);
  return { code, session };
}

export function buildWhatsAppCloudEmbeddedSignupLoginOptions(input: {
  readonly configurationId: string;
  readonly state: string;
}): FacebookLoginOptions {
  return {
    config_id: input.configurationId,
    response_type: "code",
    override_default_response_type: true,
    state: input.state,
    extras: {
      version: "v3",
      featureType: "whatsapp_business_app_onboarding"
    }
  };
}

export function parseWhatsAppCloudEmbeddedSignupMessage(input: {
  readonly origin: string;
  readonly data: unknown;
}): WhatsAppCloudEmbeddedSignupSession | null {
  if (input.origin !== "https://www.facebook.com" && input.origin !== "https://web.facebook.com") {
    return null;
  }
  const data = parseJsonRecord(input.data);
  if (!data || data.type !== "WA_EMBEDDED_SIGNUP") return null;
  const payload = isRecord(data.data) ? data.data : {};
  const event = readString(data.event);
  if (!event) return null;
  return {
    event,
    wabaId: readString(payload.waba_id),
    phoneNumberId: readString(payload.phone_number_id),
    businessId: readString(payload.business_id)
  };
}

function loadFacebookSdk(
  browserWindow: BrowserWindow,
  documentRef: Document,
  input: StartWhatsAppCloudConnectionResponse
): Promise<FacebookSdk> {
  if (browserWindow.FB) {
    browserWindow.FB.init({
      appId: input.appId,
      autoLogAppEvents: true,
      xfbml: true,
      version: input.graphApiVersion
    });
    return Promise.resolve(browserWindow.FB);
  }

  return new Promise((resolve, reject) => {
    const previousInit = browserWindow.fbAsyncInit;
    browserWindow.fbAsyncInit = () => {
      previousInit?.();
      if (!browserWindow.FB) {
        reject(new Error("Facebook SDK did not initialize"));
        return;
      }
      browserWindow.FB.init({
        appId: input.appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: input.graphApiVersion
      });
      resolve(browserWindow.FB);
    };

    const existingScript = documentRef.getElementById("facebook-jssdk");
    if (existingScript) return;

    const script = documentRef.createElement("script");
    script.id = "facebook-jssdk";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.onerror = () => reject(new Error("Facebook SDK failed to load"));
    documentRef.body.appendChild(script);
  });
}

function loginWithFacebookForBusiness(
  facebook: FacebookSdk,
  input: StartWhatsAppCloudConnectionResponse
): Promise<string> {
  return new Promise((resolve, reject) => {
    facebook.login(
      (response) => {
        const code = response.authResponse?.code;
        if (!code) {
          reject(new Error("Meta did not return a WhatsApp Embedded Signup code"));
          return;
        }
        resolve(code);
      },
      buildWhatsAppCloudEmbeddedSignupLoginOptions({
        configurationId: input.configurationId,
        state: input.state
      })
    );
  });
}

function waitForWhatsAppCloudEmbeddedSignupSession(
  browserWindow: BrowserWindow,
  timeoutMs: number
): Promise<WhatsAppCloudEmbeddedSignupSession> {
  return new Promise((resolve, reject) => {
    const timeout = browserWindow.setTimeout(() => {
      browserWindow.removeEventListener("message", listener);
      reject(new Error("Meta did not return WhatsApp Embedded Signup session data"));
    }, timeoutMs);
    const listener = (event: MessageEvent) => {
      const session = parseWhatsAppCloudEmbeddedSignupMessage({
        origin: event.origin,
        data: event.data
      });
      if (!session) return;
      browserWindow.clearTimeout(timeout);
      browserWindow.removeEventListener("message", listener);
      resolve(session);
    };
    browserWindow.addEventListener("message", listener);
  });
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  if (typeof value !== "string") return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
