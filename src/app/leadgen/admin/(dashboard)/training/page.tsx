import BrentsEssentialsTrainingContent from "@/components/leadgen/BrentsEssentialsTrainingContent";
import ConnectProposeCloseCourse from "@/components/ConnectProposeCloseCourse";

export default function LeadgenAdminTrainingPage() {
  return (
    <div className="space-y-6">
      <ConnectProposeCloseCourse crm="leadgen" />
      <BrentsEssentialsTrainingContent dashboardHref="/leadgen/admin" />
    </div>
  );
}