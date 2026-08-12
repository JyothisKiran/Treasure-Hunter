import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/8bit/button";
import GameRoadmap1, { type Quest } from "@/components/ui/8bit/blocks/game-roadmap1";
import { useGetVisitedNodes } from "@/hooks/queries/useGetVisitedNodes";
import { toast } from "@/components/ui/8bit/toast";
interface Node {
  data: string;
  status: string;
  effects?: string;
  }

interface TransformedNode {
  title: string;
  description: string;
  status: Quest["status"];
  action: () => void;
  }

const LandingPage = () => {
  const navigate = useNavigate();
  const [vistedNodes, setVistedNodes] = useState<TransformedNode[]>([]);
    const { data: result } = useGetVisitedNodes();
    console.log(result);

  
    const showAlreadyVisited = (status: string) => {
      if (status ==="completed"){
        toast("You have already visited this node")
      }else{
        toast("You died! Go back")
      }
    }
    

 const transformNodes = (nodes: Node[]): TransformedNode[] => {
  return nodes.map((node, index) => ({
    title: node.effects==="JUNCTION" ? "Junction" : `Quest${index + 1}`,
    description: node.data,
    status: node.status as Quest["status"],
    action: node.status === "in-progress" ? () => navigate('/detail') : () =>  showAlreadyVisited(node.status), 
    effects: node.effects,
  }));
};

useEffect(() => {
  if (result) {
    const transformedNodes = transformNodes(result);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVistedNodes(transformedNodes);
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [result]);



  return (
    <>
      {result?.length > 0 ? (
        <GameRoadmap1 quests={transformNodes(result)}/>
      ):(
        <div className="flex flex-col items-center justify-center h-screen gap-8 px-4 pt-8">
          <Button onClick={() => navigate('/scan')} type="button">
            Start your journey
          </Button>
          <p className="retro text-center text-xs text-muted-foreground">
            Scan any treasure code to begin your adventure in the pixelquest universe!
          </p>
        </div>
      )}
    </>
  );
};

export default LandingPage;
