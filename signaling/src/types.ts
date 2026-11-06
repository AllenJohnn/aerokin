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
  authSecret: string;
}

export interface RegisteredMessage extends BaseSignalingMessage {
  type: 'registered';
  pcId: string;
  iceServers: IceServerConfig[];
}

export interface JoinMessage extends BaseSignalingMessage {
  type: 'join';
  pcId: string;
  clientId: string;
  authSecret: string;
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
  | JoinMessage
  | JoinedMessage
  | OfferMessage
  | AnswerMessage
  | CandidateMessage
  | PeerJoinedMessage
  | PeerLeftMessage
  | ErrorMessage
  | { type: 'ping' | 'pong' };
