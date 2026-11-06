export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface TurnCredentialsResponse {
  username: string;
  credential: string;
  ttlSeconds: number;
  expiresAt: number;
  iceServers: IceServerConfig[];
}

export type SignalingMessageType =
  | 'register'
  | 'registered'
  | 'join'
  | 'joined'
  | 'offer'
  | 'answer'
  | 'candidate'
  | 'peer_joined'
  | 'peer_left'
  | 'add_client_token'
  | 'remove_client_token'
  | 'turn_credentials'
  | 'ping'
  | 'pong'
  | 'error';

export interface BaseSignalingMessage {
  type: SignalingMessageType;
}

export interface RegisterMessage extends BaseSignalingMessage {
  type: 'register';
  pcId: string;
  agentSecret?: string;
  authSecret?: string; // legacy alias for agentSecret
  clientTokenHashes?: string[];
}

export interface RegisteredMessage extends BaseSignalingMessage {
  type: 'registered';
  pcId: string;
  iceServers: IceServerConfig[];
}

export interface AddClientTokenMessage extends BaseSignalingMessage {
  type: 'add_client_token';
  pcId: string;
  agentSecret: string;
  tokenHash: string;
}

export interface RemoveClientTokenMessage extends BaseSignalingMessage {
  type: 'remove_client_token';
  pcId: string;
  agentSecret: string;
  tokenHash: string;
}

export interface JoinMessage extends BaseSignalingMessage {
  type: 'join';
  pcId: string;
  clientId: string;
  signalingToken?: string;
  authSecret?: string; // legacy alias for signalingToken
}

export interface JoinedMessage extends BaseSignalingMessage {
  type: 'joined';
  pcId: string;
  clientId: string;
  iceServers: IceServerConfig[];
}

export interface OfferMessage extends BaseSignalingMessage {
  type: 'offer';
  targetPeerId: string;
  senderPeerId?: string;
  sdp: string;
}

export interface AnswerMessage extends BaseSignalingMessage {
  type: 'answer';
  targetPeerId: string;
  senderPeerId?: string;
  sdp: string;
}

export interface CandidateMessage extends BaseSignalingMessage {
  type: 'candidate';
  targetPeerId: string;
  senderPeerId?: string;
  candidate: any;
}

export interface PeerJoinedMessage extends BaseSignalingMessage {
  type: 'peer_joined';
  peerId: string;
}

export interface PeerLeftMessage extends BaseSignalingMessage {
  type: 'peer_left';
  peerId: string;
}

export interface ErrorMessage extends BaseSignalingMessage {
  type: 'error';
  message: string;
  code?: string;
}

export type SignalingMessage =
  | RegisterMessage
  | RegisteredMessage
  | AddClientTokenMessage
  | RemoveClientTokenMessage
  | JoinMessage
  | JoinedMessage
  | OfferMessage
  | AnswerMessage
  | CandidateMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | ErrorMessage
  | { type: 'ping' | 'pong' };
