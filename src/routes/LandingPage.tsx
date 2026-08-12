import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/8bit/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/8bit/card";
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

interface JunctionOptionsProps {
  answers: NodeAnswer[];
  selectedPath: string | null;
  onSelect: (path: number) => void;
}

function JunctionOptions({
  answers,
  selectedPath,
  onSelect,
}: JunctionOptionsProps) {
  return (
    <Card className="w-full max-w-2xl border-blue-500 bg-blue-50/80 dark:border-blue-400 dark:bg-blue-950/40">
      <CardHeader className="pb-3">
        <CardTitle className="retro text-sm">Choose Your Path</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row">
        {answers.map((item) => {
          const isEasyWay = item.is_nearest;
          const isSelected = selectedPath === String(item.id);

          return (
            <Button
              aria-pressed={isSelected}
              className={`h-auto min-h-20 flex-1 flex-col gap-2 px-6 py-4 ${
                isEasyWay
                  ? "bg-emerald-100 text-emerald-950 hover:bg-emerald-200 dark:bg-emerald-900/60 dark:text-emerald-50 dark:hover:bg-emerald-900/80"
                  : "bg-red-100 text-red-950 hover:bg-red-200 dark:bg-red-900/60 dark:text-red-50 dark:hover:bg-red-900/80"
              } ${isSelected ? "ring-2 ring-offset-2" : ""}`}
              key={item.id}
              onClick={() => onSelect(item.id)}
              type="button"
            >
              <span className="text-base font-bold">{item.answer}</span>
              <span className="text-[10px] uppercase tracking-wide">
                {isEasyWay ? "The Easy Way" : "The Hard Way"}
              </span>
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
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
    // DetailPage stores the chosen path under the junction node's id.
    const savedPath = localStorage.getItem(String(node.id))?.trim();

    if (savedPath) {
      setSelectedPath(savedPath);
      setSelectedJunction(null);
      toast("Loading your saved path...");
      return;
    }

    setSelectedPath(null);
    setSelectedJunction(node);
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
        <p className="retro flex min-h-dvh items-center justify-center text-xs">
          Loading quest map...
        </p>
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
          {selectedJunction &&
            (selectedJunction.answers?.length ? (
              <div className="flex h-screen items-center justify-center p-2">
                <JunctionOptions
                  answers={selectedJunction.answers}
                  onSelect={(path) => {
                    setSelectedPath(String(path));
                    localStorage.setItem(selectedJunction.id.toString(), path.toString());
                    setSelectedJunction(null);
                    toast("Loading selected path...");
                  }}
                  selectedPath={selectedPath}
                />
              </div>
            ) : (
              <p className="retro text-xs text-muted-foreground">
                No paths are available for this junction.
              </p>
            ))}
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
