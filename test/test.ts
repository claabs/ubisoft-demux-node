import 'dotenv/config';
import { UbisoftDemux } from '../src';
import { fileHashToPathChar } from '../src/util';

jest.setTimeout(15000);
describe('Demux package', () => {
  let ubi: UbisoftDemux;
  const email = process.env.EMAIL || '';
  const password = process.env.PASSWORD || '';

  afterEach(async () => {
    await ubi.destroy();
  });

  it('should send a basic request', async () => {
    ubi = new UbisoftDemux();
    const resp = await ubi.basicRequest({
      getPatchInfoReq: {
        patchTrackId: '129.0',
        testConfig: false,
        trackType: 0,
      },
    });

    expect(resp.toJSON()).toMatchObject({
      requestId: 0,
      getPatchInfoRsp: {
        success: true,
        patchTrackId: 'DEFAULT',
        testConfig: false,
        patchBaseUrl: expect.any(String),
        latestVersion: expect.any(Number),
        trackType: 0,
      },
    });
  });

  it('should send a service request', async () => {
    ubi = new UbisoftDemux();
    const resp = await ubi.serviceRequest('utility_service', {
      request: {
        geoipReq: {},
      },
    });

    expect(resp.toJSON()).toMatchObject({
      response: {
        geoipRsp: {
          countryCode: expect.any(String),
          continentCode: expect.any(String),
        },
      },
    });
  });

  it('should get a session token and authorize', async () => {
    ubi = new UbisoftDemux();
    const resp = await ubi.ubiServices.login(email, password);
    expect(resp).toMatchObject({
      platformType: 'uplay',
      ticket: expect.any(String),
      twoFactorAuthenticationTicket: null,
      profileId: expect.any(String),
      userId: expect.any(String),
      nameOnPlatform: expect.any(String),
      environment: 'Prod',
      expiration: expect.any(String),
      spaceId: 'e17be87d-2996-4f3b-97c4-19bb2dae2933',
      clientIp: expect.any(String),
      clientIpCountry: 'US',
      serverTime: expect.any(String),
      sessionId: expect.any(String),
      sessionKey: expect.any(String),
      rememberMeTicket: expect.any(String),
    });

    const { ticket } = resp;
    const authResp = await ubi.basicRequest({
      authenticateReq: {
        clientId: 'uplay_pc',
        sendKeepAlive: false,
        token: {
          ubiTicket: ticket,
        },
      },
    });

    expect(authResp).toMatchObject({
      requestId: 0,
      authenticateRsp: {
        success: true,
      },
    });
  });

  it('should open and push to a connection', async () => {
    ubi = new UbisoftDemux();
    const { ticket } = await ubi.ubiServices.login(email, password);
    await ubi.basicRequest({
      authenticateReq: {
        clientId: 'uplay_pc',
        sendKeepAlive: false,
        token: {
          ubiTicket: ticket,
        },
      },
    });

    const connection = await ubi.openConnection('ownership_service');

    const resp = await connection.request({
      request: {
        requestId: 1,
        initializeReq: {
          getAssociations: true,
          protoVersion: 7,
          useStaging: false,
        },
      },
    });

    expect(resp.toJSON()).toMatchObject({
      response: {
        requestId: 1,
        initializeRsp: {
          ownedGames: expect.any(Object),
        },
      },
    });
  });

  it('should get download manifest for an old version', async () => {
    const TRACKMANIA_ID = 5595;

    ubi = new UbisoftDemux();
    const { ticket } = await ubi.ubiServices.login(email, password);
    await ubi.basicRequest({
      authenticateReq: {
        clientId: 'uplay_pc',
        sendKeepAlive: false,
        token: {
          ubiTicket: ticket,
        },
      },
    });

    const ownershipConnection = await ubi.openConnection('ownership_service');

    await ownershipConnection.request({
      request: {
        requestId: 1,
        initializeReq: {
          getAssociations: true,
          protoVersion: 7,
          useStaging: false,
        },
      },
    });

    const ownershipTokenResp = await ownershipConnection.request({
      request: {
        requestId: 0,
        ownershipTokenReq: {
          productId: TRACKMANIA_ID,
        },
      },
    });

    const ownershipToken = ownershipTokenResp.response?.ownershipTokenRsp?.token as string;
    expect(ownershipToken).toBeDefined();

    const downloadConnection = await ubi.openConnection('download_service');

    await downloadConnection.request({
      request: {
        requestId: 0,
        initializeReq: {
          ownershipToken,
        },
      },
    });

    const hashes = ['1762A79B92863ABE35E23D2361669D67943EAA4C'];

    const slicePaths = hashes.map((hash) => `slices_v3/${fileHashToPathChar(hash)}/${hash}`);

    const relativePaths = [
      ...slicePaths,
      'manifests/6AE3706598150132DC1A850493D1194AA516FC89.metadata',
    ];

    const urlRequestResp = await downloadConnection.request({
      request: {
        requestId: 0,
        urlReq: {
          urlRequests: [
            {
              productId: TRACKMANIA_ID,
              relativeFilePath: relativePaths,
            },
          ],
        },
      },
    });
    expect(urlRequestResp.response?.urlRsp?.urlResponses).toBeDefined();
    relativePaths.forEach((path) => {
      expect(JSON.stringify(urlRequestResp.response?.urlRsp?.urlResponses)).toContain(path);
    });
  });
});
