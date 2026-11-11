/// <reference types="miniprogram-api-typings" />

/** Shared-environment client, available in WeChat base library 2.19.4+. */
interface WxCloud {
  Cloud: new (options: { resourceAppid: string; resourceEnv: string }) => WxCloud
}
