import GameRoom from "./GameRoom.jsx";
export default function Player(props) {
  return <GameRoom {...props} role="player" />;
}
