import dynamic from "next/dynamic";
const MindMap = dynamic(() => import("../components/MindMap"), { ssr: false });
export default function Home() {
  return <MindMap />;
}
