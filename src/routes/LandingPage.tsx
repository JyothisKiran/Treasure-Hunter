import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/8bit/button";
import GameRoadmap1, {
  type Quest,
} from "@/components/ui/8bit/blocks/game-roadmap1";
import { useGetVisitedNodes } from "@/hooks/queries/useGetVisitedNodes";
import { toast } from "@/components/ui/8bit/toast";
import type { NodeAnswer } from "@/types/detail";

interface Node {
  id: number;
  data: string;
  status: string;
  effects?: string;
  answers?: NodeAnswer[];
}

interface TransformedNode {
  title: string;
  description: string;
  status: Quest["status"];
  action: () => void;
}

const LandingPage = () => {
  const navigate = useNavigate();
  const [selectedJunction, setSelectedJunction] = useState<Node | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const { data: result, isPending, isError } = useGetVisitedNodes(selectedPath);

  const showAlreadyVisited = (status: string) => {
    if (status === "completed") {
      toast("You have already visited this node");
    } else {
      toast("You died! Go back");
    }
  };

  const handleJunctionClick = (node: Node) => {
    if (node.status === "in-progress") {
      navigate("/detail");
    } else if (node.status === "completed") {
      // check if already a child is visited
      const savedPath = localStorage.getItem(String(node.id))?.trim();
      // if visited show that path
      if (savedPath) {
        setSelectedPath(savedPath);
        setSelectedJunction(null);
        toast("Loading your saved path...");
        return;
      }
      // Otherwise, show the available paths.
      setSelectedPath(null);
      setSelectedJunction(node);
    }
  };

  const transformNodes = (nodes: Node[]): TransformedNode[] => {
    return nodes.map((node, index) => ({
      title: node.effects === "JUNCTION" ? "Junction" : `Quest${index + 1}`,
      description: node.data,
      status: node.status as Quest["status"],
      action:
        node.effects === "JUNCTION"
          ? () => handleJunctionClick(node)
          : node.status === "in-progress"
            ? () => navigate("/detail")
            : () => showAlreadyVisited(node.status),
      effects: node.effects,
    }));
  };

  return (
    <>
      {isPending ? (
        <div className="retro flex min-h-dvh flex-col items-center justify-center gap-4 text-xs">
          <Loader2 aria-hidden="true" className="size-6 animate-spin text-primary" />
          <p className="animate-pulse">Loading quest map...</p>
        </div>
      ) : isError ? (
        <p className="retro flex min-h-dvh items-center justify-center text-xs text-destructive">
          Unable to load the quest map.
        </p>
      ) : result?.length > 0 ? (
        <div>
          {!selectedJunction && (
            <div className="flex w-full flex-col items-center gap-8">
              <GameRoadmap1 quests={transformNodes(result)} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center h-screen gap-8 px-4 pt-8">
          <Button onClick={() => navigate("/scan")} type="button">
            Start your journey
          </Button>
          <p className="retro text-center text-xs text-muted-foreground">
            Scan any treasure code to begin your adventure in the pixelquest
            universe!
          </p>
        </div>
      )}
    </>
  );
};

export default LandingPage;
