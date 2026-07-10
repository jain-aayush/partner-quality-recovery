## Case Study 6 — Urban Company: Service Quality Recovery

### The business problem

Urban Company's beauty category in Delhi has a structural quality problem: customer satisfaction scores are 15% below the platform average, and the problem isn't uniformly distributed. Haircuts are fine. Hair coloring is terrible. South Delhi partners perform better than North Delhi partners. The top 20% of partners have 4.7+ ratings; the bottom 30% have below 3.5 — and the bottom 30% are generating 70% of the complaints and refunds.

Urban Company's quality team knows this at the aggregate level. What they don't know: why the bottom 30% are underperforming. Some of these partners lack specific technical skills. Some have the skills but are rushing jobs to maximize bookings. Some are using cheap supplies that aren't disclosed to customers. Some are getting unfair reviews because of reasons outside their control (the customer had unrealistic expectations, the customer's hair was damaged before the visit). And some are genuinely not good enough and should be offboarded.

The interventions are completely different for each root cause — and applying the wrong intervention wastes money and time, and often makes the partner feel wrongly accused, which makes them less likely to engage with future interventions.

Urban Company has: partner performance data (ratings, completion rates, cancellations), customer review text, service category data, booking patterns, and the ability to deploy interventions (training modules, supply kits, increased scrutiny, temporary hold from bookings, offboarding).

### Why a single AI call won't solve this

Root cause analysis requires reading each underperforming partner's review history, identifying what customers specifically say is going wrong, cross-referencing with the partner's booking patterns and service category, and forming a hypothesis about the root cause. This is different for each partner. Then an intervention needs to be selected from the available set based on the diagnosis. Then the intervention needs to be executed — and for some interventions (like training), that's a multi-week process with checkpoints. Then the results need to be monitored and the intervention adjusted if it's not working.

This is a per-partner diagnosis and intervention pipeline, running in parallel for hundreds of partners, with feedback loops.

### What good looks like

The bottom 30% of underperforming Urban Company beauty partners in Delhi are each classified into one of a small number of root-cause buckets. The appropriate intervention for each bucket is executed in the right sequence. 60 days later, measurably more partners have improved vs. a control group. Partners who are genuinely unimprovable are identified and offboarded faster, freeing capacity for better partners.

### The hard question

Urban Company's intervention system will sometimes misclassify a partner — diagnosing them as having a skill gap when the real problem is customer expectations, for example. This leads to a training intervention that doesn't fix the underlying problem, and leaves the partner feeling unsupported or wrongly criticized. Given that these partners depend on Urban Company for their livelihood, what is Urban Company's accountability when an incorrect diagnosis leads to the wrong intervention and a partner's bookings decline? What oversight mechanism should exist before a system-generated diagnosis is acted upon?

---

## Capstone Evaluation Criteria

Your demo on July 18 will be evaluated on these dimensions. The evaluation doesn't care whether you built one agent or five, whether you used tools or multi-step workflows, or whether your solution is simple or complex. It cares whether you solved the problem well and understood what you built.

| Criterion | What we're looking for |
|---|---|
| **Does it run?** | Complete end-to-end demo of a real scenario, live, without breaking |
| **PM decisions visible** | You can articulate 3–5 architecture decisions you made and why — including decisions about what NOT to automate |
| **Loops and agentic patterns identified** | You can explain where your system loops, where it makes autonomous decisions, and where it hands off to a human |
| **Failure surface understood** | You've tested the system against inputs designed to break it and addressed the most important failure modes |
| **Evals present** | At least 5 test cases documented with pass/fail results, including at least one adversarial test case |
| **Cost and scale awareness** | You can estimate the monthly cost of running this system at realistic scale for the business |
| **Governance decision made** | You've made a specific, defensible decision about the hard governance question — not a disclaimer, an actual product decision |

A capstone that scores well on all seven is exceptional. Getting through the first four is the baseline.
