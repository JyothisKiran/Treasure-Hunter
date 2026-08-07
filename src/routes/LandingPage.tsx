import GameRoadmap1 from "@/components/ui/8bit/blocks/game-roadmap1"
import HealthBar from "@/components/ui/8bit/blocks/health-bar"

const LandingPage = () => {
    return(
        <div>
            <div className="mx-auto max-w-2xl px-4 pt-8">
                <HealthBar filledHearts={3} totalPoints={1250} />
            </div>
            <GameRoadmap1 />
        </div>
    )
}

export default LandingPage